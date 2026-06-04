# Production server — no pause (for Task Scheduler / startup).
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
