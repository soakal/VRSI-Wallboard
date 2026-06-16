param([switch]$Unattended)
# Pull the latest code from GitHub, rebuild, and restart VRSI WallBoard.
# Double-click Update-WallBoard.bat to run, or choose P from WallBoard-Menu.bat.
# -Unattended (used by POST /api/update/run) skips the dirty-tree prompt.
if (-not $PSScriptRoot) { $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

$logDir = Get-EnvValue 'LOGS_DIR' 'C:\ProgramData\VRSIWallBoard\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
Start-Transcript -Path (Join-Path $logDir 'update.log') -Append | Out-Null

# Re-enable the tray task (if it was running) and start the server again. Used on
# the success path AND on failure recovery, so a half-failed update never leaves
# the kiosk down with the tray task disabled.
function Restart-WallBoardServer {
    param([bool]$TrayWasRunning)
    if ($TrayWasRunning) {
        Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
        $trayBat = Join-Path $RepoRoot 'Start-TrayApp.bat'
        if (Test-Path $trayBat) {
            Start-Process 'cmd.exe' -ArgumentList "/c `"$trayBat`"" -WindowStyle Hidden
            return
        }
        Write-Warning "Start-TrayApp.bat not found at $trayBat  - falling back to headless service."
    }
    $serviceScript = Join-Path $PSScriptRoot 'Start-WallBoard-Service.ps1'
    Start-Process "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$serviceScript`""
}

$serverStopped = $false
$restarted = $false
$trayWasRunning = $false

try {

Write-Host ''
Write-Host '  VRSI WallBoard - Update' -ForegroundColor Cyan
Write-Host '  =======================' -ForegroundColor Cyan
Write-Host ''

# 0. Detect whether the tray app is running (mutex 'VRSIWallBoardTray').
#    If it is, stop it now  - it will otherwise restart the old server within
#    seconds of Stop-WallBoardServer, causing a port-conflict and a false
#    health-check against the stale build.
Write-Step 'Checking for tray app'
$trayMutexHandle = $null
$trayWasRunning  = [System.Threading.Mutex]::TryOpenExisting('VRSIWallBoardTray', [ref]$trayMutexHandle)
if ($trayMutexHandle) { $trayMutexHandle.Dispose() }   # handle not needed beyond the probe
if ($trayWasRunning) {
    Write-Host '  Tray app detected  - disabling task + stopping tray before rebuild' -ForegroundColor DarkGray
    # Disable the scheduled task FIRST so Task Scheduler does not relaunch the
    # tray mid-update (RestartCount=3 would otherwise fire within 60 seconds).
    Disable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
    Get-CimInstance Win32_Process |
        Where-Object { $_.Name -in @('powershell.exe', 'pwsh.exe') -and $_.CommandLine -like '*Start-TrayApp.ps1*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
} else {
    Write-Host '  No tray app detected' -ForegroundColor DarkGray
}

# 1. Check for local modifications that would block git pull
Write-Step 'Checking for local changes'
Push-Location $RepoRoot
$dirty = git status --porcelain 2>$null
$autoStashed = $false
if ($dirty) {
    Write-Warning 'Uncommitted local changes detected:'
    Write-Host $dirty -ForegroundColor DarkYellow
    if ($Unattended) {
        Write-Host '  Auto-stashing changes for unattended update' -ForegroundColor DarkGray
        git stash push -m 'pre-update auto-stash (unattended)' 2>&1 | Out-Host
        $autoStashed = ($LASTEXITCODE -eq 0)
    } else {
        $ans = Read-Host 'Continue anyway? (Y/N)'
        if ($ans -notmatch '^[Yy]') { Pop-Location; Stop-Transcript | Out-Null; exit 1 }
    }
}

# 2. Pull latest code
Write-Step 'Pulling latest code from GitHub'
git pull --ff-only
if ($LASTEXITCODE -ne 0) {
    if ($autoStashed) { git stash pop 2>&1 | Out-Host }
    Pop-Location
    throw 'git pull failed. The branch may have diverged - pull manually, then re-run this script.'
}

if ($autoStashed) {
    Write-Host '  Restoring auto-stash' -ForegroundColor DarkGray
    git stash pop 2>&1 | Out-Host
}
Pop-Location

# 3. Stop the running server
Write-Step 'Stopping WallBoard server'
Stop-WallBoardServer | Out-Null
$serverStopped = $true

# 4. Build (delegates to Build-Production.ps1 to avoid duplication)
#    $LASTEXITCODE is NOT checked here  - PowerShell script invocation does not
#    reliably set $LASTEXITCODE; build failures surface via throw inside
#    Build-Production.ps1 (which runs with $ErrorActionPreference='Stop').
Write-Step 'Rebuilding (shared -> server -> client)'
& (Join-Path $PSScriptRoot 'Build-Production.ps1')

# 5. Restart: prefer tray (which owns server lifecycle) when it was present;
#    fall back to headless service only when no tray was running.
Write-Step 'Restarting server'
Restart-WallBoardServer -TrayWasRunning $trayWasRunning
$restarted = $true

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

# 7. Restart kiosk browser so it loads the new version.
#    Only kill browser processes that were launched in kiosk mode pointing at
#    localhost:3001  - never kill unrelated Edge/Chrome sessions by name alone.
Write-Step 'Restarting kiosk browser'
Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" |
    Where-Object { $_.CommandLine -like '*--kiosk*localhost:3001*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
& (Join-Path $PSScriptRoot 'Start-Kiosk.ps1')

Write-Host ''
Write-Host 'Update complete. WallBoard is running the new version.' -ForegroundColor Green
Write-Host ''
if (-not $Unattended) { Start-Sleep -Seconds 3 }

} catch {
    Write-Warning "Update failed: $($_.Exception.Message)"
    # If we stopped the server but never reached the restart, bring the existing
    # version back up so the board is not left down with the tray task disabled.
    if ($serverStopped -and -not $restarted) {
        Write-Warning 'Restarting the existing version so the board is not left down...'
        try {
            Restart-WallBoardServer -TrayWasRunning $trayWasRunning
        } catch {
            Write-Warning "Recovery restart also failed: $($_.Exception.Message)."
        }
    }
    throw
} finally {
    Stop-Transcript | Out-Null
}
