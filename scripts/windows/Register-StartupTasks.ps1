. "$PSScriptRoot\_common.ps1"
Write-Step 'Registering startup at logon'
. (Join-Path $PSScriptRoot '_Register-Startup.ps1')
Write-Host ''
Write-Host 'At next logon, server and kiosk start automatically.' -ForegroundColor Green
