# Shared helpers for VRSI WallBoard Windows scripts.
$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:ServerDir = Join-Path $RepoRoot 'server'
$script:ClientDir = Join-Path $RepoRoot 'client'
$script:WallBoardUrl = 'http://localhost:3001'

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-ServerEnv {
    $envFile = Join-Path $ServerDir '.env'
    if (-not (Test-Path $envFile)) {
        $example = Join-Path $ServerDir '.env.production.example'
        if (Test-Path $example) {
            Copy-Item $example $envFile
            Write-Warning "Created server\.env from .env.production.example  -  edit ADMIN_TOKEN before production use."
        } else {
            throw "Missing server\.env. Copy server\.env.production.example to server\.env first."
        }
    }
    Ensure-SupportEmailInEnv -EnvFile $envFile
    return $envFile
}

# Product support inbox — baked into every install/upgrade if missing from .env.
function Ensure-SupportEmailInEnv {
    param([string]$EnvFile = (Join-Path $ServerDir '.env'))
    if (-not (Test-Path $EnvFile)) { return }
    $lines = @(Get-Content $EnvFile)
    foreach ($line in $lines) {
        if ($line -match '^\s*SUPPORT_EMAIL\s*=') { return }
    }
    Add-Content -Path $EnvFile -Value 'SUPPORT_EMAIL=briank@vrs-inc.com' -Encoding utf8
    Write-Host '  Added SUPPORT_EMAIL=briank@vrs-inc.com to server\.env' -ForegroundColor DarkGray
}

function Test-WallBoardHealthy {
    try {
        $r = Invoke-RestMethod -Uri "$WallBoardUrl/health" -TimeoutSec 5
        return $r.status -eq 'ok'
    } catch {
        return $false
    }
}

function Get-EnvValue([string]$Name, [string]$Default) {
    $envFile = Join-Path $ServerDir '.env'
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) {
            if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.+)\s*$") {
                $v = $Matches[1].Trim()
                if ($v) { return $v }
            }
        }
    }
    return $Default
}

function Get-BackupDir {
    $raw = Get-EnvValue 'BACKUP_DIR' 'C:\ProgramData\VRSIWallBoard\backups'
    if ([System.IO.Path]::IsPathRooted($raw)) { return $raw }
    return (Join-Path $ServerDir $raw)
}

function Get-DataDir {
    $raw = Get-EnvValue 'DATA_DIR' 'C:\ProgramData\VRSIWallBoard\data'
    if ([System.IO.Path]::IsPathRooted($raw)) { return $raw }
    return (Join-Path $ServerDir $raw)
}

function Get-DbPath {
    Join-Path (Get-DataDir) 'wallboard.db'
}

# Write the outcome of an update run to logs\update-status.json so the server's
# GET /api/update/status can surface it to the operator. Called on BOTH the
# success and failure paths — a silent failure (the worst property of the old
# flow) becomes a red error in Settings instead of looking like success.
function Write-UpdateStatus {
    param(
        [bool]$Ok,
        [string]$Message,
        [string]$FromVersion = '',
        [string]$ToVersion = ''
    )
    try {
        $logDir = Get-EnvValue 'LOGS_DIR' 'C:\ProgramData\VRSIWallBoard\logs'
        if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
        $status = [ordered]@{
            ok          = $Ok
            message     = $Message
            at          = (Get-Date).ToString('o')
            fromVersion = $FromVersion
            toVersion   = $ToVersion
        }
        # -Compress keeps it a single line; UTF8 so the Node side reads it cleanly.
        Set-Content -Path (Join-Path $logDir 'update-status.json') `
            -Value ($status | ConvertTo-Json -Compress) -Encoding UTF8
    } catch {
        # Never let a status-write failure mask the real update outcome.
        Write-Warning "Could not write update-status.json: $($_.Exception.Message)"
    }
}

function Stop-WallBoardServer {
    $conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) {
        Write-Host 'No process listening on port 3001.'
        return $false
    }
    $serverPid = $conn.OwningProcess
    $proc = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -ne 'node') {
        Write-Warning "Port 3001 is owned by '$($proc.ProcessName)' (PID $serverPid), not node - not stopping it."
        return $false
    }
    Write-Step "Stopping process on port 3001 (PID $serverPid)"
    Stop-Process -Id $serverPid -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    return $true
}
