param([switch]$Unattended)
# Download the latest GitHub release zip and update this install in place.
# This is the update path for kiosk PCs installed from the release folder
# (no git repo). Triggered by Update-FromRelease.bat or the Update button
# in Settings (POST /api/update/run). Logs to update.log in the logs dir.
if (-not $PSScriptRoot) { $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'
$GitHubRepo = 'soakal/VRSI-Wallboard'

$logDir = Get-EnvValue 'LOGS_DIR' 'C:\ProgramData\VRSIWallBoard\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
Start-Transcript -Path (Join-Path $logDir 'update.log') -Append | Out-Null

try {
    Write-Host ''
    Write-Host '  VRSI WallBoard - Update from GitHub release' -ForegroundColor Cyan
    Write-Host '  ===========================================' -ForegroundColor Cyan
    Write-Host ''

    # 1. Find the latest release and its zip asset
    Write-Step 'Checking GitHub for the latest release'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $rel = Invoke-RestMethod "https://api.github.com/repos/$GitHubRepo/releases/latest" `
        -Headers @{ 'User-Agent' = 'VRSI-WallBoard-Updater' } -TimeoutSec 30
    $asset = $rel.assets | Where-Object { $_.name -like 'VRSI-WallBoard-*.zip' } | Select-Object -First 1
    if (-not $asset) { throw "Latest release $($rel.tag_name) has no VRSI-WallBoard zip asset." }
    Write-Host "  Latest release: $($rel.tag_name)  ($($asset.name))"

    # 2. Download and extract to a temp folder
    $tmpRoot = Join-Path $env:TEMP 'vrsi-wallboard-update'
    if (Test-Path $tmpRoot) { Remove-Item $tmpRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $zipPath = Join-Path $tmpRoot $asset.name

    Write-Step 'Downloading release zip'
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing -TimeoutSec 300

    Write-Step 'Extracting'
    Expand-Archive -Path $zipPath -DestinationPath $tmpRoot -Force
    $newRoot = Join-Path $tmpRoot 'VRSI WallBoard'
    if (-not (Test-Path (Join-Path $newRoot 'server\dist\index.js'))) {
        throw 'Downloaded release is missing server\dist\index.js - aborting before touching the install.'
    }

    # 3. Stop the tray (disable its task FIRST so Task Scheduler does not
    #    relaunch it mid-update), then stop the server
    Write-Step 'Stopping tray and server'
    $trayMutexHandle = $null
    $trayWasRunning = [System.Threading.Mutex]::TryOpenExisting('VRSIWallBoardTray', [ref]$trayMutexHandle)
    if ($trayMutexHandle) { $trayMutexHandle.Dispose() }
    if ($trayWasRunning) {
        Disable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
        Get-CimInstance Win32_Process |
            Where-Object { $_.Name -in @('powershell.exe', 'pwsh.exe') -and $_.CommandLine -like '*Start-TrayApp.ps1*' } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 1
    }
    Stop-WallBoardServer | Out-Null
    Start-Sleep -Seconds 1

    # 4. Copy the new files over the install (data lives in ProgramData and
    #    server\.env is not part of the release zip, so both are untouched)
    Write-Step "Copying new files over $RepoRoot"
    Copy-Item -Path (Join-Path $newRoot '*') -Destination $RepoRoot -Recurse -Force

    # 5. Update server dependencies (the release ships package.json +
    #    package-lock.json but no node_modules). Refresh PATH from the
    #    registry first - this script may run from a context without it.
    $_mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $_up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ((@($_mp, $_up) | Where-Object { $_ }) -join ';')
    Write-Step 'Updating server dependencies'
    Push-Location $ServerDir
    & npm install --omit=dev --no-audit --no-fund 2>&1 | Out-Host
    $npmExit = $LASTEXITCODE
    Pop-Location
    if ($npmExit -ne 0) { throw "npm install failed with exit code $npmExit." }

    # 6. Restart: prefer the tray when it was running; otherwise headless
    Write-Step 'Restarting server'
    if ($trayWasRunning) {
        Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
        $trayBat = Join-Path $RepoRoot 'Start-TrayApp.bat'
        if (Test-Path $trayBat) {
            Start-Process 'cmd.exe' -ArgumentList "/c `"$trayBat`"" -WindowStyle Hidden
        } else {
            Write-Warning "Start-TrayApp.bat not found at $trayBat - falling back to headless service."
            $serviceScript = Join-Path $PSScriptRoot 'Start-WallBoard-Service.ps1'
            Start-Process "$env:SystemRoot\System32\conhost.exe" `
                -ArgumentList "--headless $env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$serviceScript`""
        }
    } else {
        $serviceScript = Join-Path $PSScriptRoot 'Start-WallBoard-Service.ps1'
        Start-Process "$env:SystemRoot\System32\conhost.exe" `
            -ArgumentList "--headless $env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$serviceScript`""
    }

    # 7. Wait for the server to come back
    Write-Step 'Waiting for server to be ready'
    $waited = 0
    do {
        Start-Sleep -Seconds 2
        $waited += 2
    } until ((Test-WallBoardHealthy) -or ($waited -ge 60))
    if (Test-WallBoardHealthy) {
        Write-Host "Server healthy at $WallBoardUrl" -ForegroundColor Green
    } else {
        Write-Warning 'Server did not respond within 60s. Check tray-startup.log and update.log.'
    }

    # 8. Restart the kiosk browser so it loads the new version. Only kill
    #    browsers launched in kiosk mode against localhost:3001.
    Write-Step 'Restarting kiosk browser'
    $kioskBrowsers = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" |
        Where-Object { $_.CommandLine -like '*--kiosk*localhost:3001*' }
    if ($kioskBrowsers) {
        $kioskBrowsers | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
        & (Join-Path $PSScriptRoot 'Start-Kiosk.ps1')
    }

    # 9. Clean up the temp download
    Remove-Item $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ''
    Write-Host "Update to $($rel.tag_name) complete." -ForegroundColor Green
    Write-Host ''
    if (-not $Unattended) { Start-Sleep -Seconds 3 }
} finally {
    Stop-Transcript | Out-Null
}
