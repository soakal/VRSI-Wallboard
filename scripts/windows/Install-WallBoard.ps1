# One-step installer for a single Windows PC.
param(
    [switch]$WithStartup,
    [switch]$WithBackup,
    [switch]$SkipBuild
)

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = 'Stop'

function Install-NodeJs {
    param([switch]$Upgrade)
    $action = if ($Upgrade) { 'upgrade' } else { 'install' }
    Write-Host "  Attempting automatic Node.js LTS $action..." -ForegroundColor Yellow

    # Primary: winget (built into Windows 10 1809+ and all Windows 11)
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host '  Using winget...' -ForegroundColor Cyan
        if ($Upgrade) {
            winget upgrade OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        } else {
            winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        }
        $code = $LASTEXITCODE
        # 0 = success; -1978335135 (0x8A150049) = already installed (treat as success)
        if ($code -eq 0 -or $code -eq -1978335135) {
            $mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
            $up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
            $env:Path = (($mp, $up | Where-Object { $_ }) -join ';')
            return $true
        }
        Write-Warning "  winget $action exited $code — falling back to direct download."
    }

    # Fallback: download official LTS MSI from nodejs.org
    try {
        Write-Host '  Fetching Node.js LTS version info from nodejs.org...' -ForegroundColor Cyan
        $index  = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30 -UseBasicParsing
        $lts    = $index | Where-Object { $_.lts -and $_.lts -ne $false } | Select-Object -First 1
        if (-not $lts) { throw 'Could not find LTS entry in nodejs.org index' }
        $ver  = $lts.version   # e.g. "v20.14.0"
        $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
            'ARM64' { 'arm64' }
            'x86'   { 'x86' }
            default { 'x64' }
        }
        $msiUrl = "https://nodejs.org/dist/$ver/node-$ver-$arch.msi"
        $msi    = "$env:TEMP\nodejs-lts-installer.msi"
        Write-Host "  Downloading Node.js $ver..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $msiUrl -OutFile $msi -UseBasicParsing -TimeoutSec 300
        Write-Host '  Running installer (this may take a minute)...' -ForegroundColor Cyan
        $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart ADDLOCAL=ALL" -Wait -PassThru
        Remove-Item $msi -Force -ErrorAction SilentlyContinue
        if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) {
            if ($p.ExitCode -eq 3010) {
                Write-Warning '  Install succeeded but a restart may be needed for PATH changes to take full effect.'
            }
            $mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
            $up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
            $env:Path = (($mp, $up | Where-Object { $_ }) -join ';')
            return $true
        }
        Write-Warning "  MSI installer exited with code $($p.ExitCode)"
        return $false
    } catch {
        Write-Warning "  Download/install failed: $_"
        return $false
    }
}

function Test-NodeJs {
    $node = Get-Command node -ErrorAction SilentlyContinue

    if (-not $node) {
        $ok = Install-NodeJs
        if (-not $ok) {
            throw @"
Automatic Node.js install failed.

Install manually:
  1. Go to https://nodejs.org and download the LTS installer.
  2. Run it (leave "Add to PATH" checked).
  3. Close this window and run INSTALL.bat again.
"@
        }
        $node = Get-Command node -ErrorAction SilentlyContinue
        if (-not $node) {
            throw "Node.js was installed but 'node' is not in PATH yet. Close this window and run INSTALL.bat again."
        }
    }

    $ver   = (node -v) -replace '^v', ''
    $major = [int]($ver.Split('.')[0])

    if ($major -lt 18) {
        Write-Warning "  Node.js v$ver is too old (18+ required) — upgrading..."
        $ok = Install-NodeJs -Upgrade
        if (-not $ok) {
            throw "Node.js 18+ required (found v$ver). Upgrade from https://nodejs.org"
        }
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                    [System.Environment]::GetEnvironmentVariable('Path', 'User')
        $ver   = (node -v) -replace '^v', ''
        $major = [int]($ver.Split('.')[0])
        if ($major -lt 18) {
            throw "Upgrade did not complete. Please upgrade Node.js manually from https://nodejs.org"
        }
    }

    Write-Host "  Node.js v$ver" -ForegroundColor Green
}

function New-AdminToken {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).Replace('+', 'x').Replace('/', 'y').Substring(0, 32)
}

function Set-ServerEnvProduction {
    $envFile = Ensure-ServerEnv
    $lines = @(Get-Content $envFile)
    $token = New-AdminToken
    $out = New-Object System.Collections.Generic.List[string]
    $hadToken = $false
    $keys = @{
        'DATA_DIR' = 'C:\ProgramData\VRSIWallBoard\data'
        'BACKUP_DIR' = 'C:\ProgramData\VRSIWallBoard\backups'
        'LOGS_DIR' = 'C:\ProgramData\VRSIWallBoard\logs'
        'NODE_ENV' = 'production'
        'PORT' = '3001'
        'DISABLE_AZURE' = 'true'
        'CORS_ORIGIN' = 'http://localhost:3001'
        'LOG_LEVEL' = 'info'
    }

    foreach ($line in $lines) {
        if ($line -match '^\s*ADMIN_TOKEN\s*=') {
            if ($line -match 'REPLACE_WITH|dev-wallboard|change-me') {
                $out.Add("ADMIN_TOKEN=$token")
            } else {
                $out.Add($line)
                $token = ($line -replace '^\s*ADMIN_TOKEN\s*=\s*', '').Trim()
            }
            $hadToken = $true
            continue
        }
        $skip = $false
        foreach ($k in $keys.Keys) {
            if ($line -match "^\s*$([regex]::Escape($k))\s*=") { $skip = $true; break }
        }
        if (-not $skip) { $out.Add($line) }
    }

    if (-not $hadToken) { $out.Add("ADMIN_TOKEN=$token") }
    foreach ($k in $keys.Keys) { $out.Add("$k=$($keys[$k])") }

    $out | Set-Content -Path $envFile -Encoding utf8
    Write-Host "  server\.env configured (ADMIN_TOKEN set)" -ForegroundColor Green
    return $token
}

function Register-BackupTaskInternal {
    $script = Join-Path $PSScriptRoot 'Invoke-WallBoardBackup.ps1'
    $taskName = 'VRSI WallBoard Backup'
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    $arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours(2) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration ([TimeSpan]::MaxValue)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Description 'VRSI WallBoard SQLite backup' | Out-Null
    Write-Host "  Registered: backup every 6 hours" -ForegroundColor Green
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  VRSI WallBoard — Install' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

Write-Step 'Checking Node.js'
Test-NodeJs

Write-Step 'Creating data folders'
& (Join-Path $PSScriptRoot 'Install-DataDirs.ps1')

Write-Step 'Configuring server'
$token = Set-ServerEnvProduction

if (-not $SkipBuild) {
    Write-Step 'Installing and building (first time may take a few minutes)'
    & (Join-Path $PSScriptRoot 'Build-Production.ps1')
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $WithStartup) {
    $r = Read-Host 'Start WallBoard automatically when you log in to Windows? [Y/N]'
    $WithStartup = ($r -eq 'Y' -or $r -eq 'y')
}

if ($WithStartup) {
    Write-Step 'Registering startup at logon'
    . (Join-Path $PSScriptRoot '_Register-Startup.ps1')
} else {
    Write-Host '  Skipped startup registration.' -ForegroundColor DarkGray
    Write-Host '  Later: double-click Enable-Startup.bat (as Administrator)' -ForegroundColor DarkGray
}

if (-not $WithBackup) {
    $r = Read-Host 'Schedule automatic backups every 6 hours? [Y/N]'
    $WithBackup = ($r -eq 'Y' -or $r -eq 'y')
}

if ($WithBackup) {
    if (-not $isAdmin) {
        Write-Warning 'Backup schedule needs Administrator — run Enable-Startup.bat or Register-BackupTask.bat as Admin later.'
    } else {
        Write-Step 'Registering backup schedule'
        Register-BackupTaskInternal
    }
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  Install complete' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''
Write-Host "  App URL:     $WallBoardUrl"
Write-Host '  Board:       http://localhost:3001/board'
Write-Host '  IT report:   Ctrl+M in the app'
Write-Host ''
if ($WithStartup) {
    Write-Host '  After next logon (or reboot), server + kiosk start automatically.' -ForegroundColor Cyan
    Write-Host '  To start NOW without rebooting:'
} else {
    Write-Host '  To start now:'
}
Write-Host '    scripts\windows\Start-WallBoard-Service.bat'
Write-Host '    scripts\windows\Start-Kiosk.bat'
Write-Host ''
Write-Host '  Save this token for support (board API):' -ForegroundColor DarkGray
Write-Host "  $token" -ForegroundColor DarkGray
Write-Host ''
