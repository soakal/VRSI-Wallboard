# Wait for the server to finish booting, then open kiosk browser.
. "$PSScriptRoot\_common.ps1"

Write-Host 'Waiting 15s for WallBoard server...' -ForegroundColor DarkGray
Start-Sleep -Seconds 15
& (Join-Path $PSScriptRoot 'Start-Kiosk.ps1')
