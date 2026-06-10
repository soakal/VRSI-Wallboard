. "$PSScriptRoot\_common.ps1"

$trayPs1 = Join-Path $PSScriptRoot 'Start-TrayApp.ps1'

# Remove re-register case (tray task already exists)
$existingTray = Get-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue
if ($existingTray) { Unregister-ScheduledTask -TaskName 'VRSI WallBoard Tray' -Confirm:$false }

# Remove legacy headless server task  - replaced by tray
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
    # No interactive console session (e.g. installing over RDP or before first logon).
    # Falling back to $env:USERNAME would register the task for the elevated admin
    # account  - the exact bug this logic was written to prevent.  Require the kiosk
    # user to be interactively logged on, or pass -TriggerUser explicitly.
    throw @"
Cannot determine the interactive kiosk user (Win32_ComputerSystem.UserName is empty).
This happens when no user is currently logged on at the console, or when running
over a remote session with no active console session.

Fix: Log on as the kiosk user first, then run ENABLE-STARTUP.bat again.
"@
}

# Use wscript.exe + VBS shim so no console window ever appears in the taskbar.
# wscript.exe window-style 0 (SW_HIDE) is the only fully reliable way to launch
# PowerShell invisibly from a Task Scheduler interactive logon task.
# cmd /c start or -WindowStyle Hidden both still create a conhost that flashes.
$vbsLauncher = Join-Path $PSScriptRoot 'Start-TrayApp.vbs'
$action   = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument "`"$vbsLauncher`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $triggerUser
# -ExecutionTimeLimit ([TimeSpan]::Zero) disables the default 72-hour kill  - without it
# Task Scheduler terminates the tray (and the server it owns) after 3 days.
$settings   = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
# Principal must match the trigger user with Interactive logon; without it the task
# runs as the elevated admin (who is not interactively logged on on a kiosk PC).
$principal  = New-ScheduledTaskPrincipal -UserId $triggerUser -LogonType Interactive
Register-ScheduledTask -TaskName 'VRSI WallBoard Tray' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'VRSI WallBoard server + tray icon' | Out-Null
Write-Host "  Registered at logon: VRSI WallBoard Tray (server + tray icon) for user: $triggerUser" -ForegroundColor Green
Write-Host '  The W icon appears near the clock; app is at http://localhost:3001' -ForegroundColor DarkGray
