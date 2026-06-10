# One-step installer for a single Windows PC.
param(
    [switch]$WithStartup,
    [switch]$WithBackup,
    [switch]$SkipBuild
)

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = 'Stop'

# Maximum Node.js major version supported by better-sqlite3 prebuilt binaries in this release.
# better-sqlite3 v12.x declares engines: "20.x || 22.x || 23.x || 24.x || 25.x || 26.x"
# When upgrading better-sqlite3, check its engines field and update this cap accordingly.
$NODE_MAX_MAJOR = 26

function Install-NodeMsi {
    param([string]$Version, [string]$TempLabel = 'nodejs-installer')
    $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
        'ARM64' { 'arm64' }
        'x86'   { 'x86' }
        default { 'x64' }
    }
    $msiUrl = "https://nodejs.org/dist/$Version/node-$Version-$arch.msi"
    $msi    = "$env:TEMP\$TempLabel.msi"
    Write-Host "  Downloading Node.js $Version ($arch)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $msiUrl -OutFile $msi -UseBasicParsing -TimeoutSec 300
    Write-Host '  Running installer (this may take a minute)...' -ForegroundColor Cyan
    $p = $null
    try {
        $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart ADDLOCAL=ALL" -Wait -PassThru
    } finally {
        Remove-Item $msi -Force -ErrorAction SilentlyContinue
    }
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
}

function Get-NodeLtsVersion {
    param([int]$MajorLine = 0)
    # Fetch the full nodejs.org release index and return the latest LTS version.
    # If MajorLine > 0, restrict to that major (e.g. 22 returns latest v22.x LTS).
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30 -UseBasicParsing
    if ($MajorLine -gt 0) {
        $entry = $index | Where-Object { $_.lts -and $_.lts -ne $false -and $_.version -match "^v$MajorLine\." } | Select-Object -First 1
    } else {
        $entry = $index | Where-Object { $_.lts -and $_.lts -ne $false } | Select-Object -First 1
    }
    if (-not $entry) { throw "Could not find matching LTS entry in nodejs.org index (MajorLine=$MajorLine)" }
    return $entry.version
}

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
        Write-Warning "  winget $action exited $code  -  falling back to direct download."
    }

    # Fallback: download official LTS MSI from nodejs.org
    try {
        $ver = Get-NodeLtsVersion
        return Install-NodeMsi -Version $ver -TempLabel 'nodejs-lts-installer'
    } catch {
        Write-Warning "  Download/install failed: $_"
        return $false
    }
}

function Install-NodeJs22 {
    # Downloads and installs the latest Node.js 22 LTS directly from nodejs.org.
    # Used when the installed Node version is newer than $NODE_MAX_MAJOR and winget
    # would not downgrade it.
    Write-Host "  Installing Node.js 22 LTS (required for native module compatibility)..." -ForegroundColor Yellow
    try {
        $ver = Get-NodeLtsVersion -MajorLine 22
        return Install-NodeMsi -Version $ver -TempLabel 'nodejs-22-installer'
    } catch {
        Write-Warning "  Failed to install Node.js 22: $_"
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

    if ($major -lt 20) {
        Write-Warning "  Node.js v$ver is too old (20+ required)  -  upgrading..."
        $ok = Install-NodeJs -Upgrade
        if (-not $ok) {
            throw "Node.js 20+ required (found v$ver). Upgrade from https://nodejs.org"
        }
        $mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
        $up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
        $env:Path = (($mp, $up | Where-Object { $_ }) -join ';')
        $ver   = (node -v) -replace '^v', ''
        $major = [int]($ver.Split('.')[0])
        if ($major -lt 20) {
            throw "Upgrade did not complete. Please upgrade Node.js manually from https://nodejs.org"
        }
    }

    if ($major -gt $NODE_MAX_MAJOR) {
        Write-Warning "  Node.js v$ver is too new  -  better-sqlite3 prebuilt binaries require Node $NODE_MAX_MAJOR or earlier."
        Write-Warning "  Replacing with Node.js 22 LTS (winget does not downgrade automatically)..."
        $ok = Install-NodeJs22
        if (-not $ok) {
            throw "Node.js 22 LTS required. Install manually from https://nodejs.org/en/download (choose 22.x LTS)."
        }
        $mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
        $up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
        $env:Path = (($mp, $up | Where-Object { $_ }) -join ';')
        $ver   = (node -v) -replace '^v', ''
        $major = [int]($ver.Split('.')[0])
        if ($major -gt $NODE_MAX_MAJOR) {
            throw "Node.js 22 install did not take effect (still v$ver). Please install Node.js 22.x manually from https://nodejs.org"
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

function New-WallBoardShortcuts {
    $shell = $null
    try {
        $shell = New-Object -ComObject WScript.Shell

        # Shortcut 1: Start WallBoard
        $sc1 = $shell.CreateShortcut((Join-Path $RepoRoot 'Start WallBoard.lnk'))
        $sc1.TargetPath      = (Join-Path $PSScriptRoot 'Start-TrayApp.bat')
        $sc1.WorkingDirectory = $PSScriptRoot
        $sc1.IconLocation    = "$env:SystemRoot\System32\imageres.dll,109"
        $sc1.Description     = 'Start the VRSI WallBoard server with tray icon'
        $sc1.WindowStyle     = 7
        $sc1.Save()

        # Shortcut 2: Restart WallBoard
        $sc2 = $shell.CreateShortcut((Join-Path $RepoRoot 'Restart WallBoard.lnk'))
        $sc2.TargetPath      = (Join-Path $PSScriptRoot 'Restart-WallBoard.bat')
        $sc2.WorkingDirectory = $PSScriptRoot
        $sc2.IconLocation    = "$env:SystemRoot\System32\imageres.dll,78"
        $sc2.Description     = 'Restart the VRSI WallBoard server'
        $sc2.WindowStyle     = 1
        $sc2.Save()

        Write-Host '  Created shortcuts: Start WallBoard.lnk, Restart WallBoard.lnk' -ForegroundColor Green
    } catch {
        Write-Warning "  Could not create shortcuts: $_"
    } finally {
        if ($null -ne $shell) {
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
        }
    }
}


Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  VRSI WallBoard  -  Install' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

Write-Step 'Checking Node.js'
Test-NodeJs

Write-Step 'Creating data folders'
& (Join-Path $PSScriptRoot 'Install-DataDirs.ps1')

Write-Step 'Configuring server'
Set-ServerEnvProduction | Out-Null

$serverBuilt = Test-Path (Join-Path $ServerDir 'dist\index.js')
$clientBuilt = Test-Path (Join-Path $ClientDir 'dist\index.html')

if (-not $SkipBuild -and $serverBuilt -and $clientBuilt) {
    # Release package: pre-built dist/ is already present.
    # Only run npm install so native modules (better-sqlite3) are compiled
    # for this machine's Node.js version. Skip all TypeScript compilation.
    Write-Step 'Pre-built release detected - installing server dependencies'
    Push-Location $ServerDir
    # Remove any stale better-sqlite3 build from a prior failed attempt before reinstalling.
    $bsq3 = Join-Path $ServerDir 'node_modules\better-sqlite3'
    if (Test-Path $bsq3) {
        Write-Host '  Removing stale better-sqlite3 build...' -ForegroundColor DarkGray
        Remove-Item $bsq3 -Recurse -Force -ErrorAction SilentlyContinue
    }
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'server npm install failed' }
    Pop-Location
} elseif (-not $SkipBuild) {
    Write-Step 'Installing and building (first time may take a few minutes)'
    & (Join-Path $PSScriptRoot 'Build-Production.ps1')
}

Write-Step 'Creating shortcuts'
New-WallBoardShortcuts

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $WithStartup) {
    $r = Read-Host 'Start WallBoard at login with a tray icon near the clock? [Y/N]'
    $WithStartup = ($r -eq 'Y' -or $r -eq 'y')
}

if ($WithStartup) {
    if (-not $isAdmin) {
        Write-Warning 'Startup registration needs Administrator  - run ENABLE-STARTUP.bat as Admin after install.'
    } else {
        Write-Step 'Registering startup at logon'
        . (Join-Path $PSScriptRoot '_Register-Startup.ps1')
    }
} else {
    Write-Host '  Skipped startup registration.' -ForegroundColor DarkGray
    Write-Host '  Later: double-click ENABLE-STARTUP.bat (as Administrator)' -ForegroundColor DarkGray
}

if (-not $WithBackup) {
    $r = Read-Host 'Schedule automatic backups every 6 hours? [Y/N]'
    $WithBackup = ($r -eq 'Y' -or $r -eq 'y')
}

if ($WithBackup) {
    if (-not $isAdmin) {
        Write-Warning 'Backup schedule needs Administrator  -  run ENABLE-STARTUP.bat (project root) or scripts\windows\Register-BackupTask.bat as Admin later.'
    } else {
        Write-Step 'Registering backup schedule'
        & (Join-Path $PSScriptRoot 'Register-BackupTask.ps1')
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
    Write-Host '  After next logon the tray icon (blue W) will appear near the clock.' -ForegroundColor Cyan
    Write-Host '  Right-click the tray icon for: Open in Browser / Restart Server / Stop & Exit' -ForegroundColor Cyan
    Write-Host '  To start NOW without logging out:' -ForegroundColor Cyan
    Write-Host '    Double-click "Start WallBoard.lnk" in this folder'
    Write-Host '    (or run scripts\windows\Start-TrayApp.bat directly)'
} else {
    Write-Host '  To start now:'
    Write-Host '    Double-click "Start WallBoard.lnk" in this folder  (starts with tray icon)'
    Write-Host '    Restart: double-click "Restart WallBoard.lnk"'
    Write-Host '    No-tray alternative: scripts\windows\Start-WallBoard-Service.bat'
}
Write-Host ''
Write-Host '  Then open  http://localhost:3001  in any browser.' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Admin token saved in server\.env (ADMIN_TOKEN=...).' -ForegroundColor DarkGray
Write-Host '  To rotate the token, edit server\.env and restart the server.' -ForegroundColor DarkGray
Write-Host ''
