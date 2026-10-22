<#
.SYNOPSIS
    Merge every branch into main, and prove the result before main moves.

.DESCRIPTION
    This is the half of the merge that a machine can do without judgement:
    take each branch, merge it into main, and hold the merge hostage until
    the result is proved — dependencies install from the lockfile, the
    TypeScript compiles, the tests pass, the app builds, and the Rust side
    compiles with warnings as errors.

    Two rules matter more than the rest.

    **main only ever moves forwards, and only on proof.** A merge that does
    not pass the gate is aborted, so main is never left holding work that
    does not build. A branch that cannot be merged is left alone — the
    branch is not touched, and its worktree is never checked out, moved or
    written to.

    **A merge that needs judgement is handed to an agent.** Git can merge
    two branches that disagree about what the app is, and it will not say
    so. When that happens — a conflict, or a gate that goes red — the
    script does not guess. It calls `opencode run` and lets an agent do
    the reconciliation, with the failing output in hand.

.PARAMETER Session
    The OpenCode session to wake when judgement is needed. Falls back to
    TAVI_MERGE_SESSION, then to a .tavi-merge.json beside the script,
    then to OPENCODE_SESSION_ID.

.PARAMETER NoAgent
    Report what needs judgement, but do not wake anybody. The gate still
    runs and main still only moves on proof.

.PARAMETER Push
    Push main to origin when it has moved.

.PARAMETER Branches
    Which branches to consider. Defaults to every local branch except main.

.PARAMETER Report
    Only say what is in each branch and what is not yet in main. Nothing is
    merged, nothing is proved, and nobody is woken. This is the check to
    run before a branch is deleted: a branch can be deleted when it says
    "fully in main".

.EXAMPLE
    ./scripts/merge-main.ps1
    Merge everything, prove it, and push.

.EXAMPLE
    ./scripts/merge-main.ps1 -NoAgent -Branches CLI,UIUX
    Try two branches, and only report what would need an agent.

.EXAMPLE
    ./scripts/merge-main.ps1 -Report
    Say what each branch is holding that main does not have yet.
#>
[CmdletBinding()]
param(
  [string]$Session = "",
  [switch]$NoAgent,
  [switch]$Push,
  [switch]$Report,
  [string[]]$Branches = @()
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Where things are
# ---------------------------------------------------------------------------

# The script lives in the main worktree, so the worktree it can write to is
# the folder the script is in. Every other branch is read, never written.
$Worktree = Split-Path -Parent $PSScriptRoot

$MainBranch = "main"
$LockFile = Join-Path $env:TEMP "tavi-merge-bot.lock"
$LogDir = Join-Path $env:APPDATA "Tavi"
$LogFile = Join-Path $LogDir "merge.log"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

# ---------------------------------------------------------------------------
# Running a command
# ---------------------------------------------------------------------------

function Invoke-Native {
  <#
    Runs a command, captures everything it says into a file, and returns
    the exit code. The output goes to a file rather than to the console so
    that a native command writing to stderr is not turned into a
    PowerShell error by the pipeline.
  #>
  param(
    [Parameter(Mandatory)][string]$Command,
    [Parameter(Mandatory)][string]$WorkDir,
    [Parameter(Mandatory)][string]$OutFile
  )
  $cmdline = "$Command > `"$OutFile`" 2>&1"
  Push-Location $WorkDir
  try {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & cmd.exe /c $cmdline
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    return $code
  } finally {
    Pop-Location
  }
}

# ---------------------------------------------------------------------------
# The gate
# ---------------------------------------------------------------------------

# The build prints one advisory about the size of the bundle. It is a
# standing condition of the app, not something a merge introduced, so it
# is named here rather than being silently ignored.
$Advisory = "Some chunks are larger than"

function Test-BuildWarnings {
  <#
    Reads a build log and returns the warnings in it that are not the
    known bundle-size advisory. An empty list means the build was clean.
  #>
  param([string]$Path)
  $unknown = @()
  $inAdvisory = $false
  foreach ($line in (Get-Content -Path $Path -ErrorAction SilentlyContinue)) {
    if ($line -match [regex]::Escape($Advisory)) { $inAdvisory = $true; continue }
    if ($inAdvisory) {
      if ($line.Trim() -eq "") { $inAdvisory = $false }
      continue
    }
    if ($line -match "\(\!\)|:\s*warning:|\bwarning\b" -and $line -notmatch "PLUGIN_TIMINGS") {
      $unknown += $line.Trim()
    }
  }
  return $unknown
}

function Invoke-Gate {
  <#
    Proves a tree. Returns a result saying whether it passed, what each
    step was, and which step said what.
  #>
  param([string]$Tree, [string]$Scratch)

  $steps = New-Object System.Collections.ArrayList
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $env:RUSTFLAGS = "-D warnings"

  $add = {
    param([string]$Name, [string]$Command, [string]$WorkDir)
    $out = Join-Path $Scratch "$Name.log"
    $code = Invoke-Native -Command $Command -WorkDir $WorkDir -OutFile $out
    $text = ""
    if (Test-Path $out) { $text = (Get-Content -Path $out -Raw -ErrorAction SilentlyContinue) }
    [void]$steps.Add([pscustomobject]@{
        Name = $Name
        Code = $code
        Out  = $out
        Text = $text
      })
    return $code
  }

  $ok = $true

  # 1. The lockfile and the manifest must agree. A branch that imports a
  #    package it never declared fails here rather than at runtime.
  if ((& $add "install" "pnpm install --frozen-lockfile" $Tree) -ne 0) { $ok = $false }

  # 2. The TypeScript must compile.
  if ($ok -and (& $add "typecheck" "pnpm typecheck" $Tree) -ne 0) { $ok = $false }

  # 3. The tests must pass.
  if ($ok -and (& $add "test" "pnpm test" $Tree) -ne 0) { $ok = $false }

  # 4. The app must build, and build without a warning that is not the
  #    known bundle-size advisory.
  if ($ok -and (& $add "build" "pnpm build" $Tree) -ne 0) { $ok = $false }
  if ($ok) {
    $warnings = Test-BuildWarnings -Path (Join-Path $Scratch "build.log")
    if ($warnings.Count -gt 0) {
      Write-Log ("The build warned: " + ($warnings -join " | ")) "WARN"
      $ok = $false
    }
  }

  # 5. The Rust side must compile, with warnings as errors.
  if ($ok -and (& $add "cargo" "cargo check --all-targets" (Join-Path $Tree "src-tauri")) -ne 0) { $ok = $false }

  $ErrorActionPreference = $previous

  return [pscustomobject]@{ Ok = $ok; Steps = $steps }
}

# ---------------------------------------------------------------------------
# The agent
# ---------------------------------------------------------------------------

function Resolve-Session {
  if ($Session) { return $Session }
  if ($env:TAVI_MERGE_SESSION) { return $env:TAVI_MERGE_SESSION }
  $config = Join-Path $PSScriptRoot ".tavi-merge.json"
  if (Test-Path $config) {
    try {
      $json = Get-Content -Path $config -Raw | ConvertFrom-Json
      if ($json.session) { return $json.session }
    } catch {
      Write-Log "Could not read $config" "WARN"
    }
  }
  if ($env:OPENCODE_SESSION_ID) { return $env:OPENCODE_SESSION_ID }
  return ""
}

function Invoke-Agent {
  <#
    Wakes an agent and hands it the work that needs judgement: a branch
    that would not merge cleanly, or a merge that did not pass the gate.
    The agent is given the failing output, the path to the worktree, and
    the rules it must keep.

    The prompt is written into a wrapper script rather than passed on the
    command line, because it is long and it has quotes and newlines in it
    and a command line is no place for either.
  #>
  param([string]$SessionId, [string[]]$Problems, [string[]]$Merged)

  if ($problems.Count -eq 0) { return }

  if ($NoAgent) {
    Write-Log "Would wake an agent about:" "WARN"
    foreach ($p in $problems) { Write-Log "  $p" "WARN" }
    return
  }
  if (-not $SessionId) {
    Write-Log "No session to wake. The problems are in $LogFile" "WARN"
    foreach ($p in $problems) { Write-Log "  $p" "WARN" }
    return
  }

  $problemText = ($Problems -join "`n")
  $mergedText = if ($Merged.Count) { $Merged -join ", " } else { "none" }

  $prompt = @"
The Tavi merge bot ran and could not finish the job on its own. Its worktree
is at $Worktree, and the branch it is merging into is $MainBranch.

Merged so far: $mergedText

These need a judgement call, which is why you are being woken:

$problemText

Do this:

1. Work in the worktree at $Worktree, on the $MainBranch branch. Do not
   check out, reset, commit to, or otherwise write to any other branch's
   worktree — other people are working in them and their work must not be
   touched or lost. master is one of those; leave it alone.

2. Merge each branch named above into $MainBranch by hand. Where the two
   sides disagree, keep both sides' features unless they are the same
   feature written twice — a merge that drops a feature is a failure, and
   so is a merge that keeps two copies of the same one.

3. Prove the result before the merge is committed. The gate is:
      pnpm install --frozen-lockfile
      pnpm typecheck
      pnpm test
      pnpm build
      cargo check --all-targets   (in src-tauri, with RUSTFLAGS=-D warnings)
   All of it must pass. The build's bundle-size advisory is the one warning
   that is allowed.

4. Commit the merge, and push $MainBranch to origin.

5. Say what you did and what you had to decide. If a branch could not be
   merged safely, say so and leave it unmerged rather than merging
   something broken.
"@

  # A line starting with the here-string terminator would end the string
  # early. It cannot happen in a branch name, but a log line can be
  # anything at all.
  $prompt = ($prompt -split "`r?`n" | ForEach-Object { if ($_ -match '^"@') { "'@" + $_.Substring(2) } else { $_ } }) -join "`n"

  $wrapper = Join-Path $env:TEMP "tavi-merge-agent.ps1"
  $wrapped = @"
`$ErrorActionPreference = "Continue"
`$prompt = @'
$prompt
'@
`$out = Join-Path `$env:TEMP "tavi-merge-agent-output.log"
& opencode run --session $SessionId --auto `$prompt *>&1 | Out-File -FilePath `$out -Encoding utf8
exit `$LASTEXITCODE
"@
  Set-Content -Path $wrapper -Value $wrapped -Encoding utf8

  $outFile = Join-Path $env:TEMP "tavi-merge-agent.log"
  Write-Log "Waking agent session $SessionId"
  $code = Invoke-Native -Command "powershell -NoProfile -ExecutionPolicy Bypass -File `"$wrapper`"" -WorkDir $Worktree -OutFile $outFile
  if ($code -eq 0) {
    Write-Log "The agent finished. Its output is in $outFile"
  } else {
    Write-Log "The agent exited with $code. Its output is in $outFile" "WARN"
  }
}

# ---------------------------------------------------------------------------
# The merge
# ---------------------------------------------------------------------------

function Get-BranchCommits {
  param([string]$Branch, [string]$Into)
  $out = git -C $Worktree rev-list --count "$Into..$Branch" 2>$null
  if (-not $out) { return 0 }
  return [int]$out.Trim()
}

function Get-Uncommitted {
  <#
    How much work a branch is holding that is not committed yet. A branch
    with uncommitted files cannot be merged — git merges commits — so the
    count is worth reporting.
  #>
  param([string]$Branch)
  $paths = @(git -C $Worktree worktree list --porcelain |
    Select-String -Pattern "^worktree (.+)$" |
    ForEach-Object { $_.Matches[0].Groups[1].Value })
  foreach ($p in $paths) {
    $b = (git -C $p rev-parse --abbrev-ref HEAD 2>$null)
    if ($b -and $b.Trim() -eq $Branch) {
      $files = @(git -C $p status --porcelain 2>$null)
      # `Files`, not `Count` — a count is a number and it is asked for as
      # one, rather than through a property that shadows PowerShell's own.
      return [pscustomobject]@{ Path = $p; Files = $files.Count }
    }
  }
  return [pscustomobject]@{ Path = $null; Files = 0 }
}

function Reset-Main {
  git -C $Worktree merge --abort 2>&1 | Out-Null
  git -C $Worktree reset --hard $MainBranch 2>&1 | Out-Null
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

Write-Log "--- merge run starting ---"
Write-Log "worktree: $Worktree"

# One merge at a time. The scheduled task and a hand-run can otherwise
# arrive together, and two merges into the same worktree is a mess neither
# of them can undo.
$lockStream = $null
for ($attempt = 1; $attempt -le 2; $attempt++) {
  try {
    $lockStream = [System.IO.File]::Open(
      $LockFile,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
    break
  } catch {
    # A lock left behind by a run that died would stop every run after it.
    # The task itself is given two hours, so a lock older than that is a
    # lock nobody is holding.
    $stale = $false
    if (Test-Path $LockFile) {
      $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
      if ($age -gt (New-TimeSpan -Hours 4)) {
        Write-Log "The lock is $(([int]$age.TotalHours)) hour(s) old and nobody is holding it. Taking it over." "WARN"
        $stale = $true
      }
    }
    if ($stale) {
      Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
      continue
    }
    Write-Log "Another merge is already running. Nothing to do." "WARN"
    exit 0
  }
}

# The worktree has to be clean, or a merge would land on top of somebody's
# half-finished edits.
$dirty = @(git -C $Worktree status --porcelain)
if ($dirty.Count -gt 0) {
  Write-Log "The main worktree has $($dirty.Count) uncommitted change(s). Leaving it alone." "WARN"
  $lockStream.Close()
  exit 1
}

# Bring main up to date with what is on the remote, so a merge never
# undoes something that was already pushed.
git -C $Worktree fetch --quiet origin 2>$null
$remoteMain = (git -C $Worktree rev-parse --verify --quiet "origin/$MainBranch" 2>$null)
if ($remoteMain) {
  $local = (git -C $Worktree rev-parse $MainBranch).Trim()
  $remote = $remoteMain.Trim()
  if ($remote -ne $local) {
    git -C $Worktree merge-base --is-ancestor $local $remote 2>$null
    if ($LASTEXITCODE -eq 0) {
      # The remote is ahead: take its commits and carry on.
      git -C $Worktree merge --ff-only "origin/$MainBranch" 2>&1 | Out-Null
      Write-Log "main fast-forwarded to origin/$MainBranch"
    } else {
      git -C $Worktree merge-base --is-ancestor $remote $local 2>$null
      if ($LASTEXITCODE -eq 0) {
        # This machine is ahead of the remote. There is nothing to pull, and
        # the push below will send it.
        Write-Log "main is ahead of origin/$MainBranch. It will be pushed."
      } else {
        Write-Log "origin/$MainBranch has commits main does not, and main has commits it does not. A human has to reconcile this." "WARN"
      }
    }
  }
}

# Which branches to consider.
if ($Branches.Count -eq 0) {
  $Branches = @(git -C $Worktree for-each-ref --format="%(refname:short)" refs/heads |
    Where-Object { $_ -ne $MainBranch })
}
Write-Log "considering: $($Branches -join ', ')"

# ---------------------------------------------------------------------------
# The report
# ---------------------------------------------------------------------------

# The check to run before a branch is deleted. A branch is only safe to
# delete when every one of its commits is reachable from main *and* it is
# holding nothing uncommitted — because a deleted branch takes its
# uncommitted work with it, and that work is gone.
if ($Report) {
  Write-Log "--- branch report ---"
  foreach ($branch in $Branches) {
    $ahead = Get-BranchCommits -Branch $branch -Into $MainBranch
    $behind = Get-BranchCommits -Branch $MainBranch -Into $branch
    $tip = (git -C $Worktree rev-parse --short $branch 2>$null)
    $uncommitted = Get-Uncommitted -Branch $branch

    $reachable = $false
    git -C $Worktree merge-base --is-ancestor $branch $MainBranch 2>$null
    if ($LASTEXITCODE -eq 0) { $reachable = $true }

    $verdict = if ($reachable -and $uncommitted.Files -eq 0) {
      "fully in $MainBranch — safe to delete"
    } elseif ($reachable) {
      "in $MainBranch, but holding $($uncommitted.Files) uncommitted file(s) — commit them before deleting"
    } else {
      "$ahead commit(s) not in $MainBranch yet — do not delete"
    }

    Write-Log ""
    Write-Log "$branch  ($tip)"
    Write-Log "  commits not in $MainBranch : $ahead"
    Write-Log "  commits in $MainBranch not in it : $behind"
    Write-Log "  every commit reachable from $MainBranch : $reachable"
    if ($uncommitted.Path) {
      Write-Log "  uncommitted files : $($uncommitted.Files)  ($($uncommitted.Path))"
      foreach ($f in @(git -C $uncommitted.Path status --porcelain 2>$null)) {
        Write-Log "      $f"
      }
    } else {
      Write-Log "  uncommitted files : 0  (not checked out anywhere)"
    }
    Write-Log "  verdict : $verdict"

    if (-not $reachable) {
      $diff = @(git -C $Worktree diff --stat "$MainBranch...$branch" 2>$null)
      if ($diff.Count) {
        Write-Log "  what it has that $MainBranch does not :"
        foreach ($line in $diff) { Write-Log "      $line" }
      }
    }
  }
  Write-Log ""
  Write-Log "--- report finished ---"
  exit 0
}

$scratch = Join-Path $env:TEMP "tavi-merge-scratch"
if (Test-Path $scratch) { Remove-Item -Path $scratch -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $scratch -Force | Out-Null

$merged = @()
$problems = @()
$status = @()

foreach ($branch in $Branches) {
  $ahead = Get-BranchCommits -Branch $branch -Into $MainBranch
  if ($ahead -eq 0) {
    Write-Log "$branch is already in $MainBranch. Nothing to do."
    $status += [pscustomobject]@{ Branch = $branch; State = "already in $MainBranch"; Detail = "" }
    continue
  }

  $uncommitted = Get-Uncommitted -Branch $branch
  if ($uncommitted.Files -gt 0) {
    Write-Log "$branch has $($uncommitted.Files) uncommitted file(s) in $($uncommitted.Path). Only its committed work can be merged." "WARN"
  }

  Write-Log "merging $branch ($ahead commit(s)) into $MainBranch"
  $mergeOut = Join-Path $scratch "merge-$($branch -replace '[^a-zA-Z0-9]', '_').log"
  $code = Invoke-Native -Command "git merge --no-ff --no-commit $branch" -WorkDir $Worktree -OutFile $mergeOut

  if ($code -ne 0) {
    $conflicts = @(git -C $Worktree diff --name-only --diff-filter=U)
    Reset-Main
    $detail = if ($conflicts.Count) { "conflicts in: $($conflicts -join ', ')" } else { "the merge did not apply" }
    Write-Log "$branch did not merge. $detail" "ERROR"
    $problems += "Branch $branch would not merge into $MainBranch. $detail. The merge output is in $mergeOut."
    $status += [pscustomobject]@{ Branch = $branch; State = "would not merge"; Detail = $detail }
    continue
  }

  Write-Log "proving the merge of $branch"
  $gate = Invoke-Gate -Tree $Worktree -Scratch $scratch

  if (-not $gate.Ok) {
    $failed = @($gate.Steps | Where-Object { $_.Code -ne 0 })
    if ($failed.Count -eq 0) { $failed = @($gate.Steps | Select-Object -Last 1) }
    $failed = $failed[-1]
    Reset-Main
    Write-Log "$branch merged cleanly but did not pass the gate at '$($failed.Name)'. main was not moved." "ERROR"
    $problems += "Branch $branch merged into $MainBranch without conflicts, but the gate failed at step '$($failed.Name)'. The output is in $($failed.Out). main was left exactly as it was."
    $status += [pscustomobject]@{ Branch = $branch; State = "gate failed"; Detail = "$($failed.Name)" }
    continue
  }

  git -C $Worktree commit --no-edit -m "Merge branch '$branch' into $MainBranch" 2>&1 | Out-Null
  Write-Log "merged $branch into $MainBranch and proved it"
  $merged += $branch
  $status += [pscustomobject]@{ Branch = $branch; State = "merged and proved"; Detail = "" }
}

# Push, if there is anything to push.
if ($merged.Count -gt 0) {
  $remoteMain = (git -C $Worktree rev-parse --verify --quiet "origin/$MainBranch" 2>$null)
  if ($remoteMain -and -not $Push) {
    Write-Log "main has moved. Not pushing, because -Push was not given."
  } else {
    $pushOut = Join-Path $scratch "push.log"
    $code = Invoke-Native -Command "git push origin $MainBranch" -WorkDir $Worktree -OutFile $pushOut
    if ($code -eq 0) {
      Write-Log "pushed $MainBranch to origin"
    } else {
      Write-Log "could not push $MainBranch. The push output is in $pushOut" "ERROR"
      $problems += "The merge of $($merged -join ', ') into $MainBranch is committed locally, but the push to origin failed. The output is in $pushOut."
    }
  }
}

if ($problems.Count -gt 0) {
  Write-Log "$($problems.Count) thing(s) need a judgement call." "WARN"
  Invoke-Agent -SessionId (Resolve-Session) -Problems $problems -Merged $merged
} else {
  Write-Log "everything merged and everything passed. main is green."
}

# What happened to each branch, in one place. This is the answer to "is
# everything in main yet", and it is what the report gives in more detail.
if ($status.Count -gt 0) {
  Write-Log ""
  Write-Log "where each branch stands:"
  foreach ($s in $status) {
    $line = "  {0,-18} {1}" -f $s.Branch, $s.State
    if ($s.Detail) { $line += " ($($s.Detail))" }
    Write-Log $line
  }
}

Write-Log "--- merge run finished ---"
$lockStream.Close()
exit 0
