# Register Windows Task Scheduler job: backup every 6 hours.
# Run PowerShell as Administrator.
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

$taskName = 'VRSI WallBoard Backup'
$scriptPath = Join-Path $PSScriptRoot 'Invoke-WallBoardBackup.ps1'
$psArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning 'Re-run this script as Administrator to register the scheduled task.'
}

Write-Step "Registering scheduled task: $taskName"

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours(1) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'SQLite backup for VRSI WallBoard' -RunLevel Highest | Out-Null

Write-Host "Task registered. Runs every 6 hours (first run ~1 hour from now)." -ForegroundColor Green
Write-Host "Test now: .\scripts\windows\Invoke-WallBoardBackup.ps1" -ForegroundColor Green
