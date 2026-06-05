# Pull the latest code from GitHub, rebuild, and restart VRSI WallBoard.
# Double-click Update-WallBoard.bat to run, or choose U from WallBoard-Menu.bat.
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '  VRSI WallBoard - Update' -ForegroundColor Cyan
Write-Host '  =======================' -ForegroundColor Cyan
Write-Host ''

# 1. Check for local modifications that would block git pull
Write-Step 'Checking for local changes'
Push-Location $RepoRoot
$dirty = git status --porcelain 2>$null
if ($dirty) {
    Write-Warning 'Uncommitted local changes detected. These may block the pull:'
    Write-Host $dirty -ForegroundColor DarkYellow
    $ans = Read-Host 'Continue anyway? (Y/N)'
    if ($ans -notmatch '^[Yy]') { exit 1 }
}

# 2. Pull latest code
Write-Step 'Pulling latest code from GitHub'
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'git pull failed. The branch may have diverged — pull manually, then re-run this script.' }
Pop-Location

# 3. Stop the running server
Write-Step 'Stopping WallBoard server'
Stop-WallBoardServer | Out-Null

# 4. Build (delegates to Build-Production.ps1 to avoid duplication)
Write-Step 'Rebuilding (shared -> server -> client)'
& (Join-Path $PSScriptRoot 'Build-Production.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Server has been stopped. Run Build-Production.ps1 manually, then Start-WallBoard-Service.ps1.' }

# 5. Restart server silently (matching the Task Scheduler / startup model)
Write-Step 'Restarting server'
$serviceScript = Join-Path $PSScriptRoot 'Start-WallBoard-Service.ps1'
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$serviceScript`""

# 6. Wait for server to be healthy
Write-Step 'Waiting for server to be ready'
$maxWait = 30
$waited  = 0
do {
    Start-Sleep -Seconds 2
    $waited += 2
} until ((Test-WallBoardHealthy) -or ($waited -ge $maxWait))

if (-not (Test-WallBoardHealthy)) {
    Write-Warning 'Server did not respond within 30s. Check Start-WallBoard-Service.ps1 manually.'
} else {
    Write-Host "Server healthy at $WallBoardUrl" -ForegroundColor Green
}

# 7. Restart kiosk browser so it loads the new version
Write-Step 'Restarting kiosk browser'
$browserNames = @('msedge', 'chrome')
foreach ($name in $browserNames) {
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($procs) {
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        break
    }
}
& (Join-Path $PSScriptRoot 'Start-Kiosk.ps1')

Write-Host ''
Write-Host 'Update complete. WallBoard is running the new version.' -ForegroundColor Green
Write-Host ''
Start-Sleep -Seconds 3
