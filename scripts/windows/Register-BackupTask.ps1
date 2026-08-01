# Register Windows Task Scheduler job: backup every 6 hours.
# Run PowerShell as Administrator.
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

$taskName = 'VRSI WallBoard Backup'
$scriptPath = Join-Path $PSScriptRoot 'Invoke-WallBoardBackup.ps1'
$psArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning 'Re-run this script as Administrator to register the scheduled task.'
    exit 1
}

Write-Step "Registering scheduled task: $taskName"

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours(1) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration ([TimeSpan]::FromDays(3650))
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Run as the interactive kiosk user, NOT elevated. The install tree (including this
# script and Invoke-WallBoardBackup.ps1) is writable by that same user so the in-app
# updater can self-update - running the backup task with -RunLevel Highest would let
# anything that can write to the install tree execute code with an elevated token the
# next time the task fires. Win32_ComputerSystem.UserName reports the console session
# user regardless of the elevation this script itself is running under.
$consoleUser = (Get-CimInstance Win32_ComputerSystem -Property UserName).UserName
if (-not $consoleUser) {
    throw @"
Cannot determine the interactive kiosk user (Win32_ComputerSystem.UserName is empty).
This happens when no user is currently logged on at the console, or when running
over a remote session with no active console session.

Fix: Log on as the kiosk user first, then run Register-BackupTask.ps1 again.
"@
}
$principal = New-ScheduledTaskPrincipal -UserId $consoleUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'SQLite backup for VRSI WallBoard' | Out-Null

Write-Host "Task registered for user: $consoleUser. Runs every 6 hours (first run ~1 hour from now)." -ForegroundColor Green
Write-Host "Test now: .\scripts\windows\Invoke-WallBoardBackup.ps1" -ForegroundColor Green
