. "$PSScriptRoot\_common.ps1"

$taskName = 'VRSI WallBoard Backup'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed scheduled task: $taskName" -ForegroundColor Green
} else {
    Write-Host "Task not found: $taskName"
}
