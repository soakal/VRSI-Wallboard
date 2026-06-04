. "$PSScriptRoot\_common.ps1"

$serverPs1 = Join-Path $PSScriptRoot 'Start-WallBoard-Service.ps1'

$existing = Get-ScheduledTask -TaskName 'VRSI WallBoard Server' -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName 'VRSI WallBoard Server' -Confirm:$false }

# Remove legacy kiosk task if it was registered by an older install
$legacyKiosk = Get-ScheduledTask -TaskName 'VRSI WallBoard Kiosk' -ErrorAction SilentlyContinue
if ($legacyKiosk) { Unregister-ScheduledTask -TaskName 'VRSI WallBoard Kiosk' -Confirm:$false }

# -WindowStyle Hidden: no console window appears; node.exe runs silently in the background.
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$serverPs1`""
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'VRSI WallBoard Server' -Action $action -Trigger $trigger -Settings $settings -Description 'VRSI WallBoard silent server' | Out-Null
Write-Host '  Registered at logon: VRSI WallBoard Server (silent)' -ForegroundColor Green
Write-Host '  Open http://localhost:3001 in any browser after login.' -ForegroundColor DarkGray
