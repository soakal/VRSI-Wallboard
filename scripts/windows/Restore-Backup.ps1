. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

$backupDir = Get-BackupDir
$dataDir = Get-DataDir
$dbPath = Get-DbPath

if (-not (Test-Path $backupDir)) {
    throw "Backup folder not found: $backupDir"
}

$files = @(Get-ChildItem -Path $backupDir -Filter 'wallboard-*.db' |
    Sort-Object LastWriteTime -Descending)

if ($files.Count -eq 0) {
    throw 'No wallboard-*.db backups found.'
}

Write-Host ''
Write-Host 'Available backups:'
for ($i = 0; $i -lt $files.Count; $i++) {
    $f = $files[$i]
    Write-Host ("  [{0}] {1:yyyy-MM-dd HH:mm:ss}  {2}" -f ($i + 1), $f.LastWriteTime, $f.Name)
}
Write-Host ''

$pick = Read-Host "Enter number to restore (or full path to a .db file)"
$source = $null

if ($pick -match '^\d+$') {
    $idx = [int]$pick - 1
    if ($idx -lt 0 -or $idx -ge $files.Count) { throw 'Invalid number.' }
    $source = $files[$idx].FullName
} elseif (Test-Path $pick) {
    $source = (Resolve-Path $pick).Path
} else {
    throw 'Invalid selection.'
}

# WARNING: This is a full file-level restore (disaster recovery).
# It overwrites wallboard.db with the selected backup directly on disk.
# For merge-safe restore use the in-app restore (Monitoring panel),
# which enforces conflict checks and the project rule §7 "Merge, never overwrite".
Write-Host ''
Write-Warning 'DISASTER RECOVERY RESTORE: This performs a full file-level overwrite of wallboard.db.'
Write-Warning 'For a merge-safe restore with conflict checks, use the in-app restore (Monitoring panel) instead.'
Write-Host ''

# Check whether the system tray monitor (Start-TrayApp.ps1) is running.
# If it is, its 5-second watchdog timer will auto-restart the server during
# the file copy, potentially opening wallboard.db mid-restore and causing
# corruption when the -wal/-shm sidecars are deleted afterward.
$trayMutex = $null
$trayRunning = [System.Threading.Mutex]::TryOpenExisting('VRSIWallBoardTray', [ref]$trayMutex)
if ($trayRunning -and $trayMutex -ne $null) {
    $trayMutex.Close()
    $trayMutex.Dispose()
}

if ($trayRunning) {
    Write-Host ''
    Write-Warning 'The VRSI WallBoard tray monitor is running.'
    Write-Warning 'Its watchdog timer will auto-restart the server during restore, risking database corruption.'
    $stopTray = Read-Host 'Stop the tray monitor now so restore can proceed safely? [Y/N]'
    if ($stopTray -ne 'Y' -and $stopTray -ne 'y') {
        throw 'Right-click the W tray icon and choose Stop && Exit, then re-run restore.'
    }

    # Stop the tray process using the same CommandLine-match approach used by Uninstall-WallBoard.ps1
    $trayProcs = @(Get-CimInstance Win32_Process -Filter "Name='pwsh.exe' OR Name='powershell.exe'" |
        Where-Object { $_.CommandLine -like '*Start-TrayApp*' })
    foreach ($p in $trayProcs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Step 'Tray monitor stopped.'
    $restartTray = $true
} else {
    $restartTray = $false
}

Write-Host ''
Write-Warning 'The server must be stopped before restore.'
if (Test-WallBoardHealthy) {
    $stop = Read-Host 'Stop server on port 3001 now? [Y/N]'
    if ($stop -eq 'Y' -or $stop -eq 'y') {
        Stop-WallBoardServer | Out-Null
    } else {
        throw 'Close Start-WallBoard.bat window first, then run restore again.'
    }
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (Test-Path $dbPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $pre = Join-Path $dataDir "wallboard-pre-restore-$stamp.db"
    Copy-Item -Path $dbPath -Destination $pre -Force
    Write-Step "Current database saved as $(Split-Path $pre -Leaf)"
}

foreach ($suffix in '-wal', '-shm') {
    $sidecar = "$dbPath$suffix"
    if (Test-Path $sidecar) { Remove-Item -Path $sidecar -Force -ErrorAction SilentlyContinue }
}

Copy-Item -Path $source -Destination $dbPath -Force

foreach ($suffix in '-wal', '-shm') {
    $sidecar = "$dbPath$suffix"
    if (Test-Path $sidecar) { Remove-Item -Path $sidecar -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Host "Restored from: $source" -ForegroundColor Green
Write-Host "Database:      $dbPath" -ForegroundColor Green

# Offer to restore the token sidecar so the kiosk doesn't need a device-code re-authentication.
$tokensSidecar = [System.IO.Path]::ChangeExtension($source, '.tokens.json')
if (Test-Path $tokensSidecar) {
    Write-Host ''
    Write-Host "A backed-up auth token was found alongside this backup: $(Split-Path $tokensSidecar -Leaf)" -ForegroundColor Yellow
    $restoreTokens = Read-Host 'Restore it now to skip re-authentication on first launch? [Y/N]'
    if ($restoreTokens -eq 'Y' -or $restoreTokens -eq 'y') {
        Copy-Item -Path $tokensSidecar -Destination (Join-Path $dataDir 'tokens.json') -Force
        Write-Host 'Auth token restored.' -ForegroundColor Green
    } else {
        Write-Host 'Token not restored — you will be prompted to authenticate on first launch.' -ForegroundColor DarkGray
    }
}

Write-Host ''

if ($restartTray) {
    $trayBat = Join-Path $PSScriptRoot 'Start-TrayApp.bat'
    if (Test-Path $trayBat) {
        Start-Process -FilePath $trayBat -WindowStyle Hidden
        Write-Step 'Tray monitor restarted.'
    } else {
        Write-Warning "Could not find Start-TrayApp.bat at $trayBat  - start it manually if needed."
    }
    Write-Host 'The tray monitor has been restarted and will launch the server automatically.' -ForegroundColor Cyan
} else {
    Write-Host 'Start the server again with Start-WallBoard.bat' -ForegroundColor Cyan
}
