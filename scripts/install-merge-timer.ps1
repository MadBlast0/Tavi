<#
.SYNOPSIS
    Put the merge bot on a timer, so main is kept up to date without
    anybody having to remember to do it.

.DESCRIPTION
    Registers a Windows scheduled task that runs scripts/merge-main.ps1
    every thirty minutes. The task runs whether or not an editor, a
    terminal or an agent session is open, which is the point: the merge
    does not depend on a conversation still being alive.

    The task does not run merges blind. Every merge it makes is proved
    first, and a merge that needs judgement wakes an agent instead of
    being guessed at. See scripts/merge-main.ps1.

    The session to wake is written to a .tavi-merge.json beside the
    script, so the bot can be pointed at the session you are talking to.

.PARAMETER Session
    The OpenCode session to wake when a merge needs judgement. Defaults to
    the session this script is run from.

.PARAMETER Minutes
    How often the bot runs. Defaults to 30.

.PARAMETER TaskName
    The name of the scheduled task. Defaults to "Tavi merge bot".

.PARAMETER Remove
    Take the timer off again.

.EXAMPLE
    ./scripts/install-merge-timer.ps1
    Put the bot on a thirty-minute timer.

.EXAMPLE
    ./scripts/install-merge-timer.ps1 -Remove
    Take it off.
#>
[CmdletBinding()]
param(
  [string]$Session = "",
  [int]$Minutes = 30,
  [string]$TaskName = "Tavi merge bot",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

$Worktree = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $PSScriptRoot "merge-main.ps1"
$Config = Join-Path $PSScriptRoot ".tavi-merge.json"

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed the scheduled task '$TaskName'."
  } else {
    Write-Host "There is no scheduled task called '$TaskName'."
  }
  if (Test-Path $Config) { Remove-Item $Config -Force }
  Write-Host "The session file is gone too."
  exit 0
}

if (-not (Test-Path $Script)) { throw "The merge script is not at $Script" }

# Where the bot should wake an agent.
if (-not $Session) { $Session = $env:OPENCODE_SESSION_ID }
if (-not $Session) {
  Write-Host "No session was given and OPENCODE_SESSION_ID is not set."
  Write-Host "The bot will merge and prove, but it will not wake anybody to settle a hard merge."
  Write-Host "Run it again with -Session <session id> to have it do that."
} else {
  @{ session = $Session; installedAt = (Get-Date -Format "o") } |
    ConvertTo-Json | Set-Content -Path $Config -Encoding utf8
  Write-Host "The bot will wake session $Session when a merge needs judgement."
}

# The command the task runs. It pushes, because a merge that stays on this
# machine is a merge nobody else has.
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Script`" -Push"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $Worktree

# Every thirty minutes, starting now, and going on for ten years. The
# repetition is given a duration rather than left open, so there is no
# question of when it stops.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $Minutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

# One run at a time, do not stack up runs that fell behind, and do not put
# a window on the desktop. The bot is something that runs in the
# background, not something to be caught in the middle of.
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -Hidden `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Write-Host ""
Write-Host "The merge bot is on a timer."
Write-Host "  task:    $TaskName"
Write-Host "  runs:    every $Minutes minutes"
Write-Host "  work in: $Worktree"
Write-Host "  log:     $env:APPDATA\Tavi\merge.log"
Write-Host ""
Write-Host "Run it once by hand to see it work:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$Script`""
Write-Host ""
Write-Host "Take it off again:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Remove"
