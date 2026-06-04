# Install dependencies and build shared + client + server for production.
# Run from repo root or anywhere; requires Node.js 18+.
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

$SharedDir = Join-Path $RepoRoot 'shared'

Write-Step "Repo: $RepoRoot"
Ensure-ServerEnv | Out-Null

# shared must be built first  -  client and server both import from shared/dist/
Write-Step 'Installing shared dependencies'
Push-Location $SharedDir
npm install
if ($LASTEXITCODE -ne 0) { throw 'shared npm install failed' }

Write-Step 'Building shared types'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'shared build failed' }
Pop-Location

Write-Step 'Installing server dependencies'
Push-Location $ServerDir
npm install
if ($LASTEXITCODE -ne 0) { throw 'server npm install failed' }

Write-Step 'Building server'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'server build failed' }
Pop-Location

Write-Step 'Installing client dependencies'
Push-Location $ClientDir
npm install
if ($LASTEXITCODE -ne 0) { throw 'client npm install failed' }

Write-Step 'Building client (embedded in server at client/dist)'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'client build failed' }
Pop-Location

Write-Host ''
Write-Host 'Production build complete.' -ForegroundColor Green
Write-Host 'Next: .\scripts\windows\Start-WallBoard.ps1' -ForegroundColor Green
Write-Host 'Then: .\scripts\windows\Start-Kiosk.ps1' -ForegroundColor Green
