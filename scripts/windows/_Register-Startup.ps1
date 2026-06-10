. "$PSScriptRoot\_common.ps1"

$trayPs1 = Join-Path $PSScriptRoot 'Start-TrayApp.ps1'

# Remove re-register case (tray task already exists)
$existingTray = Get-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue
if ($existingTray) { Unregister-ScheduledTask -TaskName 'VRSI WallBoard Tray' -Confirm:$false }

# Remove legacy headless server task — replaced by tray
$legacyServer = Get-ScheduledTask -TaskName 'VRSI WallBoard Server' -ErrorAction SilentlyContinue
if ($legacyServer) { Unregister-ScheduledTask -TaskName 'VRSI WallBoard Server' -Confirm:$false }

# Remove legacy kiosk task if it was registered by an older install
$legacyKiosk = Get-ScheduledTask -TaskName 'VRSI WallBoard Kiosk' -ErrorAction SilentlyContinue
if ($legacyKiosk) { Unregister-ScheduledTask -TaskName 'VRSI WallBoard Kiosk' -Confirm:$false }

# Determine which user account to register the logon trigger for.
# When this script is invoked via UAC elevation (e.g. from INSTALL.bat or
# ENABLE-STARTUP.bat), $env:USERNAME is the ELEVATED (admin) account, not the
# interactive kiosk user who will actually log on.  Win32_ComputerSystem.UserName
# reports the console session user regardless of elevation, so prefer that.
$consoleUser = (Get-CimInstance Win32_ComputerSystem -Property UserName).UserName
if ($consoleUser) {
    $triggerUser = $consoleUser
} else {
    $triggerUser = $env:USERNAME
}

# -STA is required for Windows Forms (NotifyIcon/ContextMenuStrip use STA COM).
# -WindowStyle Hidden: no console window appears; the tray icon manages the session.
$arg      = "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File `"$trayPs1`""
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $triggerUser
# -ExecutionTimeLimit ([TimeSpan]::Zero) disables the default 72-hour kill — without it
# Task Scheduler terminates the tray (and the server it owns) after 3 days.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'VRSI WallBoard Tray' -Action $action -Trigger $trigger -Settings $settings -Description 'VRSI WallBoard server + tray icon' | Out-Null
Write-Host "  Registered at logon: VRSI WallBoard Tray (server + tray icon) for user: $triggerUser" -ForegroundColor Green
Write-Host '  The W icon appears near the clock; app is at http://localhost:3001' -ForegroundColor DarkGray
