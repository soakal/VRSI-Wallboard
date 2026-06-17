# Builds the project and creates a self-contained VRSI WallBoard\ folder.
# Copy the VRSI WallBoard\ folder to any Windows PC and run INSTALL.bat there.
. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = 'Stop'

$SharedDir   = Join-Path $RepoRoot 'shared'
$ReleasesDir = Join-Path $RepoRoot 'releases'
# Stage into a temp dir so no 'VRSI WallBoard\' folder litters the repo root.
$StagingRoot = Join-Path $env:TEMP "vrsi-release-$(Get-Date -Format 'yyyyMMddHHmmss')"
$ReleaseDir  = Join-Path $StagingRoot 'VRSI WallBoard'

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

New-Item -ItemType Directory -Path $ReleasesDir -Force | Out-Null
Write-Step "Staging release in temp: $StagingRoot"

function New-Dir([string]$Path) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

# 1. shared/ -- dist + package.json only (no src, no node_modules; no runtime deps)
Write-Host '  Copying shared...' -ForegroundColor DarkGray
New-Dir (Join-Path $ReleaseDir 'shared')
Copy-Item (Join-Path $SharedDir 'dist')         (Join-Path $ReleaseDir 'shared') -Recurse
Copy-Item (Join-Path $SharedDir 'package.json') (Join-Path $ReleaseDir 'shared')

# 2. server/ -- dist only + config files (no src, no node_modules, no .env secrets)
#    Excluding src is CRITICAL: update.ts uses the presence of server\src to decide
#    whether to use the git-pull updater vs the release-zip updater. A release install
#    must NOT have server\src or the kiosk will try (and fail) to git pull.
Write-Host '  Copying server...' -ForegroundColor DarkGray
New-Dir (Join-Path $ReleaseDir 'server')
$p = Join-Path $ServerDir 'dist'
if (Test-Path $p) { Copy-Item $p (Join-Path $ReleaseDir 'server') -Recurse }
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

# Always produce the installable zip. Named with the app version, e.g.
# VRSI-WallBoard-v0.15.0.zip, placed in releases\ (gitignored).
# To publish: gh release create vX.Y.Z "releases\VRSI-WallBoard-vX.Y.Z.zip" "releases\VRSI-WallBoard-vX.Y.Z.zip.sha256"
$zipName = if ($appVersion) { "VRSI-WallBoard-v$appVersion.zip" } else { 'VRSI-WallBoard.zip' }
$zipPath = Join-Path $ReleasesDir $zipName
Write-Step "Creating install zip: releases\$zipName"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $ReleaseDir -DestinationPath $zipPath -Force

# Measure sizes from staging before it's deleted.
$serverSize = [math]::Round((Get-ChildItem (Join-Path $ReleaseDir 'server\dist') -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
$clientSize = [math]::Round((Get-ChildItem (Join-Path $ReleaseDir 'client\dist') -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)

# Clean up the temp staging dir — the zip is the deliverable.
Remove-Item $StagingRoot -Recurse -Force -ErrorAction SilentlyContinue
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)

# Publish a SHA256 sidecar so the in-app updater can verify the download.
# Format: "<hash>  <zipname>" (sha256sum-style). Upload BOTH assets to the release.
$zipHash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower()
$shaPath = Join-Path $ReleasesDir "$zipName.sha256"
"$zipHash  $zipName" | Set-Content -Path $shaPath -Encoding ascii -NoNewline

Write-Host ''
Write-Host '==========================================' -ForegroundColor Green
Write-Host '  Release package ready' -ForegroundColor Green
Write-Host '==========================================' -ForegroundColor Green
Write-Host ''
Write-Host "  Install zip : $zipPath  ($zipSize MB)"
Write-Host "  SHA256      : $shaPath"
Write-Host "  Server      : $serverSize MB  (dist/)"
Write-Host "  Client      : $clientSize MB  (dist/)"
Write-Host ''
Write-Host '  To deploy to a new PC:' -ForegroundColor Cyan
Write-Host "    1. Extract  releases\$zipName  to the target PC"
Write-Host '    2. Inside the extracted folder, double-click  INSTALL.bat'
Write-Host '    3. Node.js will be installed automatically if needed'
Write-Host '  To publish to GitHub:' -ForegroundColor Cyan
Write-Host "    gh release create v$appVersion ""releases\$zipName"" ""releases\$zipName.sha256"""
Write-Host ''
