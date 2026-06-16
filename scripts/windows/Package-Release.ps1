# Builds the project and creates a self-contained VRSI WallBoard\ folder.
# Copy the VRSI WallBoard\ folder to any Windows PC and run INSTALL.bat there.
. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = 'Stop'

$SharedDir  = Join-Path $RepoRoot 'shared'
$ReleaseDir = Join-Path $RepoRoot 'VRSI WallBoard'

Write-Host ''
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host '  VRSI WallBoard  -  Package Release' -ForegroundColor Cyan
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host ''

Write-Step "Repo: $RepoRoot"
Write-Step 'Running production build'
# $LASTEXITCODE is NOT checked here - PowerShell script invocation does not
# reliably set $LASTEXITCODE; build failures surface via throw inside
# Build-Production.ps1 (which runs with $ErrorActionPreference='Stop').
& (Join-Path $PSScriptRoot 'Build-Production.ps1')

Write-Step "Preparing release folder: $ReleaseDir"
if (Test-Path $ReleaseDir) {
    Write-Host '  Removing previous release...' -ForegroundColor DarkGray
    Remove-Item $ReleaseDir -Recurse -Force
}

function New-Dir([string]$Path) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

# 1. shared/ -- dist + src + package.json (no node_modules; no runtime deps)
Write-Host '  Copying shared...' -ForegroundColor DarkGray
New-Dir (Join-Path $ReleaseDir 'shared')
Copy-Item (Join-Path $SharedDir 'dist')         (Join-Path $ReleaseDir 'shared') -Recurse
Copy-Item (Join-Path $SharedDir 'package.json') (Join-Path $ReleaseDir 'shared')
if (Test-Path (Join-Path $SharedDir 'src')) {
    Copy-Item (Join-Path $SharedDir 'src') (Join-Path $ReleaseDir 'shared') -Recurse
}

# 2. server/ -- dist + src + config files (no node_modules, no .env secrets)
Write-Host '  Copying server...' -ForegroundColor DarkGray
New-Dir (Join-Path $ReleaseDir 'server')
foreach ($item in @('dist', 'src')) {
    $p = Join-Path $ServerDir $item
    if (Test-Path $p) { Copy-Item $p (Join-Path $ReleaseDir 'server') -Recurse }
}
foreach ($file in @('package.json', 'package-lock.json', 'tsconfig.json', '.env.production.example')) {
    $p = Join-Path $ServerDir $file
    if (Test-Path $p) { Copy-Item $p (Join-Path $ReleaseDir 'server') }
}

# 3. client/dist only -- static assets served by the server at runtime
Write-Host '  Copying client dist...' -ForegroundColor DarkGray
New-Dir (Join-Path $ReleaseDir 'client\dist')
Copy-Item (Join-Path $ClientDir 'dist\*') (Join-Path $ReleaseDir 'client\dist') -Recurse -Force

# 4. All scripts (exclude Package-Release.ps1  - dev-only, not needed on end-user PCs)
Write-Host '  Copying scripts...' -ForegroundColor DarkGray
New-Dir (Join-Path $ReleaseDir 'scripts\windows')
Get-ChildItem "$PSScriptRoot\*.ps1" | Where-Object { $_.Name -ne 'Package-Release.ps1' } |
    Copy-Item -Destination (Join-Path $ReleaseDir 'scripts\windows')
Get-ChildItem "$PSScriptRoot\*.bat" -ErrorAction SilentlyContinue |
    Copy-Item -Destination (Join-Path $ReleaseDir 'scripts\windows')
Copy-Item "$PSScriptRoot\README.md" (Join-Path $ReleaseDir 'scripts\windows') -ErrorAction SilentlyContinue

# 5. Root batch files + user-facing docs
Write-Host '  Copying batch files and docs...' -ForegroundColor DarkGray
foreach ($bat in @('INSTALL.bat', 'ENABLE-STARTUP.bat', 'UNINSTALL.bat',
                   'Start-WallBoard.bat', 'Start-TrayApp.bat')) {
    $p = Join-Path $RepoRoot $bat
    if (Test-Path $p) { Copy-Item $p $ReleaseDir }
}
$startHere = Join-Path $RepoRoot 'docs\START-HERE.txt'
if (Test-Path $startHere) { Copy-Item $startHere $ReleaseDir }
$opsGuide = Join-Path $RepoRoot 'docs\operations-guide.md'
if (Test-Path $opsGuide) { Copy-Item $opsGuide $ReleaseDir }
$readme = Join-Path $RepoRoot 'README.md'
if (Test-Path $readme) { Copy-Item $readme $ReleaseDir }

# 6. Write a release manifest so you know when and where it was built
$nodeVer = ''
try { $nodeVer = (node -v 2>$null) } catch {}
$commitHash = ''
try { $commitHash = (git -C $RepoRoot rev-parse --short HEAD 2>$null) } catch {}
$appVersion = $null
try { $appVersion = (Get-Content (Join-Path $ServerDir 'package.json') -Raw | ConvertFrom-Json).version } catch {}
@{
    version = $appVersion
    built   = (Get-Date -Format 'yyyy-MM-dd HH:mm')
    machine = $env:COMPUTERNAME
    node    = $nodeVer
    commit  = $commitHash
} | ConvertTo-Json | Set-Content (Join-Path $ReleaseDir 'release-info.json') -Encoding utf8

# Always produce the installable zip so a release is never published without one.
# Named with the app version, e.g. VRSI-WallBoard-v0.12.0.zip, in the repo root.
$zipName = if ($appVersion) { "VRSI-WallBoard-v$appVersion.zip" } else { 'VRSI-WallBoard.zip' }
$zipPath = Join-Path $RepoRoot $zipName
Write-Step "Creating install zip: $zipName"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $ReleaseDir -DestinationPath $zipPath -Force
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)

# Publish a SHA256 sidecar so the in-app updater can verify the download.
# Format: "<hash>  <zipname>" (sha256sum-style). Upload BOTH assets to the release.
$zipHash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower()
$shaPath = "$zipPath.sha256"
"$zipHash  $zipName" | Set-Content -Path $shaPath -Encoding ascii -NoNewline

# Summary
$serverSize = [math]::Round((Get-ChildItem (Join-Path $ReleaseDir 'server\dist') -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
$clientSize = [math]::Round((Get-ChildItem (Join-Path $ReleaseDir 'client\dist') -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)

Write-Host ''
Write-Host '==========================================' -ForegroundColor Green
Write-Host '  Release package ready' -ForegroundColor Green
Write-Host '==========================================' -ForegroundColor Green
Write-Host ''
Write-Host "  Location    : $ReleaseDir"
Write-Host "  Install zip : $zipPath  ($zipSize MB)"
Write-Host "  Server      : $serverSize MB  (dist/)"
Write-Host "  Client      : $clientSize MB  (dist/)"
Write-Host ''
Write-Host '  To deploy to a new PC:' -ForegroundColor Cyan
Write-Host "    1. Copy the entire  $(Split-Path $ReleaseDir -Leaf)\  folder to the target PC"
Write-Host '    2. On the target PC, double-click  INSTALL.bat'
Write-Host '    3. Node.js will be installed automatically if needed'
Write-Host ''
