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

# Grant the interactive kiosk user Modify on the whole data tree so the
# NON-ELEVATED server/tray can write the SQLite DB, backups, and logs. Without
# this, files created by the elevated installer are Administrator-owned and the
# kiosk user hits "attempt to write a readonly database" on every board change.
# Win32_ComputerSystem.UserName reports the console session user regardless of
# elevation (so it is the kiosk user, not the elevated admin running INSTALL.bat).
$consoleUser = (Get-CimInstance Win32_ComputerSystem -Property UserName).UserName
if ($consoleUser) {
    foreach ($d in $dirs) {
        & icacls $d /grant "${consoleUser}:(OI)(CI)M" /T | Out-Null
    }
    Write-Host "  Granted $consoleUser Modify on the data directories" -ForegroundColor DarkGray
} else {
    Write-Warning 'Could not determine the interactive kiosk user. If the board reports a "readonly database", run (elevated): icacls "C:\ProgramData\VRSIWallBoard\data" /grant "<DOMAIN\user>:(OI)(CI)M" /T'
}

Write-Host ''
Write-Host 'Done. Copy wallboard.db into C:\ProgramData\VRSIWallBoard\data\ if migrating from another PC.' -ForegroundColor Green
