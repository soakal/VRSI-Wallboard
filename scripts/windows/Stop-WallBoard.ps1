. "$PSScriptRoot\_common.ps1"

Stop-WallBoardServer | Out-Null
Write-Host 'Server stopped (if it was running on port 3001).' -ForegroundColor Green
