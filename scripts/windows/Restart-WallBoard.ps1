# Restart the VRSI WallBoard server.
# If the tray app is running, the tray monitor auto-restarts the server; this script
# just stops it and waits.  If no tray is running, this script relaunches the
# headless service script directly.
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

Write-Step 'Restarting VRSI WallBoard server'
Stop-WallBoardServer | Out-Null

# Detect whether the tray app is running via its named mutex.
$trayRunning = $false
try {
    $m = $null
    $trayRunning = [System.Threading.Mutex]::TryOpenExisting('VRSIWallBoardTray', [ref]$m)
    if ($m) { $m.Dispose() }
} catch {
    $trayRunning = $false
}

if ($trayRunning) {
    Write-Host 'Tray app detected - waiting for it to restart the server...'
} else {
    # Guard: if something already listening on 3001 (e.g. tray is mid-launch or
    # the mutex probe had a timing gap), skip the fallback to avoid a port conflict.
    $alreadyUp = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($alreadyUp) {
        Write-Host '  Port 3001 is already in use - skipping headless fallback launch.' -ForegroundColor DarkGray
    } else {
        Write-Step 'No tray app detected - relaunching headless service'
        $serviceScript = Join-Path $PSScriptRoot 'Start-WallBoard-Service.ps1'
        Start-Process "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$serviceScript`"" `
            -WindowStyle Hidden
    }
}

# Poll /health once per second for up to 30 seconds.
$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-WallBoardHealthy) {
        $healthy = $true
        break
    }
}

if ($healthy) {
    Write-Host "Server restarted - $WallBoardUrl" -ForegroundColor Green
} else {
    Write-Warning 'Server did not report healthy within 30 seconds. Check logs in C:\ProgramData\VRSIWallBoard\logs.'
    if ($trayRunning) {
        Write-Warning 'If the tray icon is red/crash-looping, right-click it and choose Restart Server, or check logs.'
    }
    exit 1
}
