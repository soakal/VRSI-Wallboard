. "$PSScriptRoot\_common.ps1"

$serverPs1 = Join-Path $PSScriptRoot 'Start-WallBoard-Service.ps1'
$kioskPs1 = Join-Path $PSScriptRoot 'Start-KioskAfterDelay.ps1'

foreach ($pair in @(
        @{ Name = 'VRSI WallBoard Server'; Arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File `"$serverPs1`"" },
        @{ Name = 'VRSI WallBoard Kiosk'; Arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Maximized -File `"$kioskPs1`"" }
    )) {
    $existing = Get-ScheduledTask -TaskName $pair.Name -ErrorAction SilentlyContinue
    if ($existing) { Unregister-ScheduledTask -TaskName $pair.Name -Confirm:$false }

    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $pair.Arg
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $pair.Name -Action $action -Trigger $trigger -Settings $settings -Description 'VRSI WallBoard kiosk' | Out-Null
    Write-Host "  Registered at logon: $($pair.Name)" -ForegroundColor Green
}
