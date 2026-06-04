. "$PSScriptRoot\_common.ps1"

$dir = Get-BackupDir
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Write-Step "Opening $dir"
Start-Process explorer.exe $dir
