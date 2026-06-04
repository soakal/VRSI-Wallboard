. "$PSScriptRoot\_common.ps1"

$dir = Get-BackupDir
Write-Step "Backup folder: $dir"

if (-not (Test-Path $dir)) {
    Write-Warning 'Folder does not exist yet. Run Backup-Now.bat first.'
    exit 0
}

$files = Get-ChildItem -Path $dir -Filter 'wallboard-*.db' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

if (-not $files -or $files.Count -eq 0) {
    Write-Host 'No backup files found (wallboard-*.db).'
    exit 0
}

Write-Host ''
$i = 1
foreach ($f in $files) {
    $mb = [math]::Round($f.Length / 1MB, 2)
    Write-Host ("  {0,3}  {1:yyyy-MM-dd HH:mm}  {2,8} MB  {3}" -f $i, $f.LastWriteTime, $mb, $f.Name)
    $i++
}
Write-Host ''
Write-Host "Total: $($files.Count) file(s)"
