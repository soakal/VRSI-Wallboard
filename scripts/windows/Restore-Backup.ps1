. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

$backupDir = Get-BackupDir
$dataDir = Get-DataDir
$dbPath = Get-DbPath

if (-not (Test-Path $backupDir)) {
    throw "Backup folder not found: $backupDir"
}

$files = @(Get-ChildItem -Path $backupDir -Filter 'wallboard-*.db' |
    Sort-Object LastWriteTime -Descending)

if ($files.Count -eq 0) {
    throw 'No wallboard-*.db backups found.'
}

Write-Host ''
Write-Host 'Available backups:'
for ($i = 0; $i -lt $files.Count; $i++) {
    $f = $files[$i]
    Write-Host ("  [{0}] {1:yyyy-MM-dd HH:mm:ss}  {2}" -f ($i + 1), $f.LastWriteTime, $f.Name)
}
Write-Host ''

$pick = Read-Host "Enter number to restore (or full path to a .db file)"
$source = $null

if ($pick -match '^\d+$') {
    $idx = [int]$pick - 1
    if ($idx -lt 0 -or $idx -ge $files.Count) { throw 'Invalid number.' }
    $source = $files[$idx].FullName
} elseif (Test-Path $pick) {
    $source = (Resolve-Path $pick).Path
} else {
    throw 'Invalid selection.'
}

Write-Host ''
Write-Warning 'The server must be stopped before restore.'
if (Test-WallBoardHealthy) {
    $stop = Read-Host 'Stop server on port 3001 now? [Y/N]'
    if ($stop -eq 'Y' -or $stop -eq 'y') {
        Stop-WallBoardServer | Out-Null
    } else {
        throw 'Close Start-WallBoard.bat window first, then run restore again.'
    }
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (Test-Path $dbPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $pre = Join-Path $dataDir "wallboard-pre-restore-$stamp.db"
    Copy-Item -Path $dbPath -Destination $pre -Force
    Write-Step "Current database saved as $(Split-Path $pre -Leaf)"
}

foreach ($suffix in '-wal', '-shm') {
    $sidecar = "$dbPath$suffix"
    if (Test-Path $sidecar) { Remove-Item -Path $sidecar -Force -ErrorAction SilentlyContinue }
}

Copy-Item -Path $source -Destination $dbPath -Force

foreach ($suffix in '-wal', '-shm') {
    $sidecar = "$dbPath$suffix"
    if (Test-Path $sidecar) { Remove-Item -Path $sidecar -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Host "Restored from: $source" -ForegroundColor Green
Write-Host "Database:      $dbPath" -ForegroundColor Green
Write-Host ''
Write-Host 'Start the server again with Start-WallBoard.bat' -ForegroundColor Cyan
