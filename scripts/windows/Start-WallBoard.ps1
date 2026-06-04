# Start VRSI WallBoard API + built UI on port 3001 (production).
# Keep this window open, or run via Windows Task Scheduler at logon.
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

Ensure-ServerEnv | Out-Null

$distIndex = Join-Path $ServerDir 'dist\index.js'
$clientDist = Join-Path $ClientDir 'dist\index.html'

if (-not (Test-Path $distIndex)) {
    Write-Warning 'Server not built. Running Build-Production.ps1 first...'
    & (Join-Path $PSScriptRoot 'Build-Production.ps1')
}

if (-not (Test-Path $clientDist)) {
    throw 'Missing client\dist\index.html  -  run Build-Production.ps1 first.'
}

Write-Step "Starting VRSI WallBoard at $WallBoardUrl"
Write-Host 'Press Ctrl+C to stop.' -ForegroundColor DarkGray

Push-Location $ServerDir
$env:NODE_ENV = 'production'
npm start
