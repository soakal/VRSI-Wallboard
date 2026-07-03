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

# Run as the interactive kiosk user with LIMITED rights — NOT elevated.
# Security: the in-app updater needs the kiosk user to have Modify on the whole
# install tree (it copies scripts\ and root .bat over on self-update), so those
# script files are writable by the non-admin kiosk user. If this task ran
# elevated (-RunLevel Highest, formerly the case), anyone able to run code as
# that user could overwrite this script and have it executed with a higher-
# privilege token — a local privilege escalation. The backup only calls the
# kiosk-user HTTP API and copies files between dirs the kiosk user already owns,
# so it needs no elevation. Running it as the same limited user removes the
# escalation while keeping self-update working.
$consoleUser = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
if ($consoleUser) {
    $principal = New-ScheduledTaskPrincipal -UserId $consoleUser -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'SQLite backup for VRSI WallBoard' | Out-Null
} else {
    Write-Warning 'Could not determine the interactive user — registering the backup task without an explicit principal (still NOT elevated).'
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'SQLite backup for VRSI WallBoard' | Out-Null
}

Write-Host "Task registered. Runs every 6 hours (first run ~1 hour from now)." -ForegroundColor Green
Write-Host "Test now: .\scripts\windows\Invoke-WallBoardBackup.ps1" -ForegroundColor Green
