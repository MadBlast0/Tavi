# Runs this checkout of the app on ports of its own.
#
# Two checkouts of this source on one machine cannot share the same ports, or
# they run over each other. The second Vite cannot start — it is set to fail
# rather than to move — the second chat server cannot bind a port that is
# already bound, and, worst of all, the frontend of one answers with the
# backend of the other, because the proxy target is a port number and not a
# checkout. The desktop app is worse still: the folder it keeps its files in
# is named after the app's identifier, which is the same in every checkout, so
# two of them write the same conversations file and fight over the same
# remembered window.
#
# This script gives one checkout a web port, a chat server port, and a folder
# of its own for the app's files. Nothing outside this checkout is touched.
#
#   .\scripts\dev-local.ps1                      # the desktop app, on 1420/8787
#   .\scripts\dev-local.ps1 -WebPort 1430 -ApiPort 8790
#   .\scripts\dev-local.ps1 -Target web          # the browser on its own
#   .\scripts\dev-local.ps1 -Target server       # the chat server on its own
#
# The state it keeps — the config file, the app's files, the projects folder
# — goes in `dev.local/`, which `.gitignore` excludes with its `*.local` rule,
# so none of it is ever committed.

param(
  # The web server's port. Vite's hot-reload socket sits one above it, so the
  # two move together.
  [int]$WebPort = 1420,

  # The chat server's port. The server binds it and Vite's `/api` proxy points
  # at it, and both read the same variable, so they cannot disagree about
  # which backend the frontend is talking to.
  [int]$ApiPort = 8787,

  # What to run.
  [ValidateSet("app", "web", "server")]
  [string]$Target = "app"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$state = Join-Path $root "dev.local"

$env:TAVI_WEB_PORT = "$WebPort"
$env:CHAT_SERVER_PORT = "$ApiPort"

# The app's own files: the conversations, the folder grants, the remembered
# window. Pointed somewhere of this checkout's own.
$env:TAVI_DATA_DIR = Join-Path $state "data"

# The projects folder, for the same reason — a clone in one checkout should
# not turn up in another checkout's project list.
$env:TAVI_PROJECTS_DIR = Join-Path $state "projects"

# The desktop window is told where to load the frontend from by the Tauri
# config, and the config has no way to read an environment variable. So it is
# given an override, which Tauri merges over the file's own settings.
#
# The override is written to a file rather than passed on the command line
# because PowerShell takes the double quotes out of an argument before a
# native program sees it, and the CLI wants JSON — a JSON string on the
# command line arrives without its quotes and is refused as malformed.
#
# It is written from the port above rather than being written out again,
# because the two have to agree and there is only one number to change.
#
# `beforeDevCommand` is repeated in it for a reason: it starts the frontend
# server, and if the merge were to replace the `build` section rather than
# merge into it, leaving it out would mean the desktop app had no frontend to
# load. Repeating it makes the file correct either way.
$configPath = Join-Path $state "tauri.local.json"
$config = @{
  build = @{
    devUrl           = "http://localhost:$($env:TAVI_WEB_PORT)"
    beforeDevCommand = "pnpm dev"
  }
} | ConvertTo-Json -Depth 3
New-Item -ItemType Directory -Force -Path $state | Out-Null
Set-Content -Path $configPath -Value $config -Encoding utf8

# The app's files are copied in the first time this checkout runs, so that it
# starts where the installed app is rather than empty. The copy is then this
# checkout's own: the two go their separate ways from here.
#
# The variable is not called `$target`: PowerShell matches names without regard
# to case, so that would be an assignment to the parameter above, which has a
# fixed set of values and would refuse the assignment.
$seed = Join-Path $env:APPDATA "com.mad.tavi"
$dataDir = $env:TAVI_DATA_DIR
if (-not (Test-Path $dataDir) -and (Test-Path $seed)) {
  Write-Host "Seeding this checkout's app files from $seed"
  Copy-Item -Recurse -Force $seed $dataDir
}

Write-Host ""
Write-Host "  web    http://localhost:$($env:TAVI_WEB_PORT)"
Write-Host "  api    http://localhost:$($env:CHAT_SERVER_PORT)/api"
Write-Host "  data   $($env:TAVI_DATA_DIR)"
Write-Host ""

switch ($Target) {
  "app" { pnpm tauri dev --config "$configPath" }
  "web" { pnpm dev }
  "server" { pnpm dev:server }
}
