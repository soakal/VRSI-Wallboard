param([switch]$Unattended)
# Pull the latest code from GitHub, rebuild, and restart VRSI WallBoard.
# Double-click Update-WallBoard.bat to run, or choose P from WallBoard-Menu.bat.
# -Unattended (used by POST /api/update/run) skips the dirty-tree prompt.
if (-not $PSScriptRoot) { $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'
# PowerShell 7.3+: do not promote a native command's stderr to a terminating
# error. Harmless/ignored on the 5.1 that ships with Windows (the Invoke-Git
# wrapper below is what protects 5.1).
$PSNativeCommandUseErrorActionPreference = $false

# Run git with stderr de-fanged: git writes lots of INFORMATIONAL text to stderr
# (progress, "From github.com…", "No stash entries found"), and under
# $ErrorActionPreference='Stop' PS 5.1 turns that into a fatal NativeCommandError
# (the exact bug that aborted every unattended update). Temporarily relaxing the
# preference around the call lets us decide success/failure from the exit code.
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & git @GitArgs 2>&1 | Out-Host
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
}

$logDir = Get-EnvValue 'LOGS_DIR' 'C:\ProgramData\VRSIWallBoard\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
Start-Transcript -Path (Join-Path $logDir 'update.log') -Append | Out-Null

# Re-enable the tray task (if it was running) and start the server again. Used on
# the success path AND on failure recovery, so a half-failed update never leaves
# the kiosk down with the tray task disabled.
function Restart-WallBoardServer {
    param([bool]$TrayWasRunning)
    # Always re-enable the logon task if it exists — the task's existence, not a
    # live mutex, is the right signal that this is a tray install. Enabling does
    # not launch anything now; it only governs the next logon.
    if (Get-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue) {
        Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
    }
    if ($TrayWasRunning) {
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

function Assert-NodeCompatible {
    $nodeMin = 20
    $nodeMax = 26
    $ver = $null
    try { $ver = (& node -v) 2>$null } catch { }
    if (-not $ver) { throw 'Node.js not found on PATH - cannot update.' }
    $major = 0
    if ("$ver" -match 'v?(\d+)\.') { $major = [int]$Matches[1] }
    if ($major -lt $nodeMin -or $major -gt $nodeMax) {
        throw "Node.js $ver is unsupported (need v$nodeMin-v$nodeMax for better-sqlite3). Update aborted; the current version keeps running."
    }
}

$serverStopped = $false
$restarted = $false
$trayWasRunning = $false
$taskDisabled = $false

try {

Assert-NodeCompatible

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
    # Only disable if not already Disabled, so $taskDisabled records that THIS run
    # owns re-enabling it.
    if ((Get-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue).State -ne 'Disabled') {
        Disable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
        $taskDisabled = $true
    }
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
        # --include-untracked so release zips/.lnk/.sha256 in the repo root are actually
        # captured. Do NOT trust `git stash`'s exit code (it returns 0 even when it saves
        # nothing): gate $autoStashed on a real stash ref existing, otherwise the pop
        # below hits an empty stash and its "No stash entries found" stderr is fatal
        # under $ErrorActionPreference='Stop'.
        Invoke-Git stash push --include-untracked -m 'pre-update auto-stash (unattended)' | Out-Null
        & git rev-parse --verify --quiet refs/stash *> $null
        $autoStashed = ($LASTEXITCODE -eq 0)
    } else {
        $ans = Read-Host 'Continue anyway? (Y/N)'
        if ($ans -notmatch '^[Yy]') { Pop-Location; Stop-Transcript | Out-Null; exit 1 }
    }
}

# 2. Pull latest code
Write-Step 'Pulling latest code from GitHub'
$pullExit = Invoke-Git pull --ff-only
if ($pullExit -ne 0) {
    # Restore the stash if we made one; the pop is best-effort so it can never
    # mask the real "git pull failed" message below.
    if ($autoStashed) { Invoke-Git stash pop | Out-Null }
    Pop-Location
    throw 'git pull failed. The branch may have diverged - pull manually, then re-run this script.'
}

if ($autoStashed) {
    Write-Host '  Restoring auto-stash' -ForegroundColor DarkGray
    # A benign stash issue (empty/conflicting) must not abort a pull that already
    # succeeded; Invoke-Git keeps git's stderr non-fatal.
    Invoke-Git stash pop | Out-Null
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

$healthy = Test-WallBoardHealthy
if (-not $healthy) {
    Write-Warning 'Server did not respond within 30s. Check Start-WallBoard-Service.ps1 manually.'
} else {
    Write-Host "Server healthy at $WallBoardUrl" -ForegroundColor Green
}

# 7. Restart the board browser so it loads the new version.
#    Only kill the dedicated board WINDOW (--app= or legacy --kiosk) pointing at
#    localhost:3001  - never a regular browser where the board is just one tab.
Write-Step 'Restarting board browser'
Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" |
    Where-Object { $_.CommandLine -like '*localhost:3001*' -and ($_.CommandLine -like '*--app*' -or $_.CommandLine -like '*--kiosk*') } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
& (Join-Path $PSScriptRoot 'Start-Kiosk.ps1')

Write-Host ''
if ($healthy) {
    Write-Host 'Update complete. WallBoard is running the new version.' -ForegroundColor Green
    Write-UpdateStatus -Ok $true -Message 'Update complete. WallBoard is running the new version.'
} else {
    Write-UpdateStatus -Ok $false -Message 'Update applied but the server did not come back healthy within 30s. Check update.log.'
}
Write-Host ''
if (-not $Unattended) { Start-Sleep -Seconds 3 }

} catch {
    Write-Warning "Update failed: $($_.Exception.Message)"
    Write-UpdateStatus -Ok $false -Message "Update failed: $($_.Exception.Message)"
    # The tray task is the sole logon launcher; if THIS run disabled it, re-enable
    # it even when the failure happened before the server was stopped (e.g. an
    # early git failure) so the tray still auto-starts at next logon.
    if ($taskDisabled -and -not $restarted) {
        Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
    }
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
    # Enabled is the correct steady state for the logon task; restore it on EVERY
    # exit path (success, caught failure, rethrow) so an update can never leave the
    # tray unable to start at logon. Idempotent; only attempted if the task exists.
    if (Get-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue) {
        try { Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction Stop | Out-Null }
        catch { Write-Warning "Could not re-enable 'VRSI WallBoard Tray' task: $($_.Exception.Message)" }
    }
    Stop-Transcript | Out-Null
}
