# Headless server, no pause (for Task Scheduler / startup).
# Internal fallback only - no crash-restart or hang watchdog. Production launches
# must use Start-TrayApp.ps1; this script is invoked automatically by the
# updater/restart scripts ONLY when Start-TrayApp.bat cannot be found.
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'
Ensure-ServerEnv | Out-Null

$distIndex = Join-Path $ServerDir 'dist\index.js'
if (-not (Test-Path $distIndex)) {
    & (Join-Path $PSScriptRoot 'Build-Production.ps1')
}

Push-Location $ServerDir
$env:NODE_ENV = 'production'
& node dist/index.js
