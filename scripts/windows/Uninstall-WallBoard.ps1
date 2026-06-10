param(
    [string]$Choice = ''
)

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = 'Stop'

function Remove-AllTasks {
    foreach ($name in @('VRSI WallBoard Backup', 'VRSI WallBoard Tray', 'VRSI WallBoard Server', 'VRSI WallBoard Kiosk')) {
        $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if ($t) {
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
            Write-Host "  Removed task: $name" -ForegroundColor Green
        }
    }
}

function Stop-TrayApp {
    $trayProcs = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" |
        Where-Object { $_.CommandLine -like '*Start-TrayApp.ps1*' }
    $stopped = $false
    foreach ($proc in $trayProcs) {
        try {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            $stopped = $true
        } catch {
            # ignore — process may have already exited
        }
    }
    if ($stopped) {
        Write-Host '  Stopped tray app.' -ForegroundColor Green
    }
}

function Remove-WallBoardShortcuts {
    foreach ($name in @('Start WallBoard.lnk', 'Restart WallBoard.lnk')) {
        $path = Join-Path $RepoRoot $name
        if (Test-Path $path) {
            Remove-Item -Path $path -Force
            Write-Host "  Removed: $name" -ForegroundColor Green
        }
    }
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  VRSI WallBoard  -  Uninstall' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Does NOT remove Node.js or this project folder.'
Write-Host ''

Write-Step 'Stopping tray app (if running)'
Stop-TrayApp

Write-Step 'Stopping server on port 3001 (if running)'
Stop-WallBoardServer | Out-Null

if (-not $Choice) {
    Write-Host '  1  Remove auto-start and auto-backup only (KEEP your job data)'
    Write-Host '  2  Remove auto-start + DELETE all WallBoard data (database, backups, logs)'
    Write-Host '  3  Cancel'
    Write-Host ''
}
while ($Choice -notin @('1', '2', '3')) { $Choice = Read-Host 'Choose 1, 2, or 3' }

if ($Choice -eq '3') {
    Write-Host 'Cancelled.'
    exit 0
}

Write-Step 'Removing scheduled tasks'
Remove-AllTasks

Write-Step 'Removing shortcuts'
Remove-WallBoardShortcuts

if ($Choice -eq '2') {
    $progData = 'C:\ProgramData\VRSIWallBoard'
    if (Test-Path $progData) {
        Remove-Item -Path $progData -Recurse -Force
        Write-Host "  Deleted: $progData" -ForegroundColor Yellow
    }
    $devDb = Join-Path $ServerDir 'data'
    if (Test-Path (Join-Path $devDb 'wallboard.db')) {
        Remove-Item -Path (Join-Path $devDb 'wallboard.db*') -Force -ErrorAction SilentlyContinue
        Write-Host '  Deleted: server\data\wallboard.db' -ForegroundColor Yellow
    }
} else {
    Write-Host '  Kept all data files (ProgramData and server\data).' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Uninstall complete.' -ForegroundColor Green
Write-Host 'To remove the app entirely, delete this project folder in Explorer.' -ForegroundColor DarkGray
Write-Host ''
