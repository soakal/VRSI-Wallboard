# Creates ProgramData folders for production data, backups, and logs.
# Run once on the kiosk PC (Administrator not required).
. "$PSScriptRoot\_common.ps1"

Write-Step 'Creating VRSI WallBoard data directories'

$dirs = @(
    'C:\ProgramData\VRSIWallBoard\data',
    'C:\ProgramData\VRSIWallBoard\backups',
    'C:\ProgramData\VRSIWallBoard\logs'
)

foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
    Write-Host "  OK  $d"
}

Write-Host ''
Write-Host 'Done. Copy wallboard.db into C:\ProgramData\VRSIWallBoard\data\ if migrating from another PC.' -ForegroundColor Green
