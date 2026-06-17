# Trigger SQLite backup via API. Safe to run while the app is running.
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

if (-not (Test-WallBoardHealthy)) {
    Write-Error "WallBoard is not running at $WallBoardUrl. Start the server first."
}

Write-Step 'Requesting backup'
$body = @{ source = 'scheduled' } | ConvertTo-Json
$result = Invoke-RestMethod -Method POST -Uri "$WallBoardUrl/api/storage/backup" -ContentType 'application/json' -Body $body -TimeoutSec 120

$dest = $result.data.destination
Write-Host "Backup saved under: $dest" -ForegroundColor Green

# Copy tokens.json alongside the .db backup so that a restore-to-new-PC also
# restores authentication (avoids a mandatory device-code re-authentication).
$backupPath = $result.data.path
if (-not $result.data.skipped -and $backupPath) {
    $tokensSource = Join-Path (Get-DataDir) 'tokens.json'
    if (Test-Path $tokensSource) {
        $tokensSidecar = [System.IO.Path]::ChangeExtension($backupPath, '.tokens.json')
        Copy-Item -Path $tokensSource -Destination $tokensSidecar -Force
        Write-Host "  Auth token also backed up: $(Split-Path $tokensSidecar -Leaf)" -ForegroundColor DarkGray
    }
}

# Optional: keep only last 28 .db files (7 days @ 6 hours); prune matching token sidecars too.
if ($dest -and (Test-Path $dest)) {
    $files = Get-ChildItem -Path $dest -Filter 'wallboard-*.db' | Sort-Object LastWriteTime -Descending
    if ($files.Count -gt 28) {
        $toRemove = $files | Select-Object -Skip 28
        foreach ($f in $toRemove) {
            Remove-Item -Path $f.FullName -Force
            $sidecar = [System.IO.Path]::ChangeExtension($f.FullName, '.tokens.json')
            if (Test-Path $sidecar) { Remove-Item -Path $sidecar -Force }
        }
        Write-Host "Pruned old backups (kept 28 newest)." -ForegroundColor DarkGray
    }
}
