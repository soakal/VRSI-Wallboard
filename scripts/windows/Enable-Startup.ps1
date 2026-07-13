. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ''
Write-Host 'VRSI WallBoard  -  Enable startup at logon' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path (Join-Path $ServerDir 'dist\index.js'))) {
    Write-Warning 'App not built yet. Run INSTALL.bat first.'
    & (Join-Path $PSScriptRoot 'Build-Production.ps1')
}

Write-Step 'Registering startup tasks'
. (Join-Path $PSScriptRoot '_Register-Startup.ps1')

if ($isAdmin) {
    $r = Read-Host 'Also schedule backups every 6 hours? [Y/N]'
    if ($r -eq 'Y' -or $r -eq 'y') {
        & (Join-Path $PSScriptRoot 'Register-BackupTask.ps1')
    }
} else {
    Write-Host ''
    Write-Warning 'Run Register-BackupTask.bat as Administrator for scheduled backups.'
}

Write-Host ''
Write-Host 'Done. Sign out and back in (or reboot) to test auto-start.' -ForegroundColor Green
Write-Host 'Start manually now: Start-TrayApp.bat (or the "Start WallBoard.lnk" shortcut)' -ForegroundColor Cyan
Write-Host ''
