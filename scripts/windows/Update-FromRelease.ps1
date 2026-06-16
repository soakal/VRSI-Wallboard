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

# Re-enable the tray task (if it was running) and start the server again. Used on
# the success path AND on failure recovery, so a half-failed update never leaves
# the kiosk down with the tray task disabled.
function Restart-WallBoardServer {
    param([bool]$TrayWasRunning)
    if ($TrayWasRunning) {
        Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
        $trayBat = Join-Path $RepoRoot 'Start-TrayApp.bat'
        if (Test-Path $trayBat) {
            Start-Process 'cmd.exe' -ArgumentList "/c `"$trayBat`"" -WindowStyle Hidden
            return
        }
        Write-Warning "Start-TrayApp.bat not found at $trayBat - falling back to headless service."
    }
    $serviceScript = Join-Path $PSScriptRoot 'Start-WallBoard-Service.ps1'
    Start-Process "$env:SystemRoot\System32\conhost.exe" `
        -ArgumentList "--headless $env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$serviceScript`""
}

# Abort early (before touching the install) if Node is missing or its major version
# is outside what better-sqlite3 prebuilt binaries support (matches the installer's
# 20-26 cap) — otherwise npm install fails after the server is already stopped.
function Assert-NodeCompatible {
    $nodeMin = 20
    $nodeMax = 26
    $ver = $null
    try { $ver = (& node -v) 2>$null } catch { }
    if (-not $ver) { throw 'Node.js not found on PATH - cannot update. Re-run INSTALL.bat as Administrator.' }
    $major = 0
    if ("$ver" -match 'v?(\d+)\.') { $major = [int]$Matches[1] }
    if ($major -lt $nodeMin -or $major -gt $nodeMax) {
        throw "Node.js $ver is unsupported (need v$nodeMin-v$nodeMax for better-sqlite3). Update aborted; the current version keeps running."
    }
    Write-Host "  Node.js $ver OK"
}

# Recovery state: if we stop the server and then a later step throws, the catch
# block must bring the existing version back up.
$serverStopped = $false
$restarted = $false
$trayWasRunning = $false

try {
    Write-Host ''
    Write-Host '  VRSI WallBoard - Update from GitHub release' -ForegroundColor Cyan
    Write-Host '  ===========================================' -ForegroundColor Cyan
    Write-Host ''

    # 0. Refresh PATH from the registry (this can run from a context without it),
    #    then fail fast if Node is missing/incompatible BEFORE touching anything.
    $_mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $_up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ((@($_mp, $_up) | Where-Object { $_ }) -join ';')
    Assert-NodeCompatible

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

    # 2b. Verify the download against the published checksum if the release has one
    #     (guards a corrupt/truncated download or a swapped asset). Fail BEFORE
    #     touching the install. Older releases with no .sha256 asset are skipped.
    $shaAsset = $rel.assets | Where-Object { $_.name -like '*.sha256' } | Select-Object -First 1
    if ($shaAsset) {
        Write-Step 'Verifying download checksum'
        $shaPath = Join-Path $tmpRoot $shaAsset.name
        Invoke-WebRequest -Uri $shaAsset.browser_download_url -OutFile $shaPath -UseBasicParsing -TimeoutSec 60
        $expected = (((Get-Content $shaPath -Raw) -split '\s+') | Where-Object { $_ })[0].Trim().ToLower()
        $actual = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower()
        if ($expected -ne $actual) {
            throw "Checksum mismatch (expected $expected, got $actual) - download corrupt or tampered. Aborting before touching the install."
        }
        Write-Host '  Checksum verified.'
    } else {
        Write-Host '  No .sha256 asset on this release - skipping checksum.'
    }

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
    $serverStopped = $true

    # 3b. Snapshot the current build (dist + manifests, NOT node_modules) so we can
    #     roll back if the NEW version copies in but fails to start.
    $rollbackDir = Join-Path $tmpRoot 'rollback'
    if (Test-Path $rollbackDir) { Remove-Item $rollbackDir -Recurse -Force }
    $rollbackItems = @('server\dist', 'client\dist', 'shared\dist', 'server\package.json', 'server\package-lock.json')
    foreach ($item in $rollbackItems) {
        $src = Join-Path $RepoRoot $item
        if (Test-Path $src) {
            $dst = Join-Path $rollbackDir $item
            New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
            Copy-Item $src $dst -Recurse -Force
        }
    }

    # 4. Copy the new files over the install (data lives in ProgramData and
    #    server\.env is not part of the release zip, so both are untouched)
    Write-Step "Copying new files over $RepoRoot"
    Copy-Item -Path (Join-Path $newRoot '*') -Destination $RepoRoot -Recurse -Force

    # 5. Update server dependencies (the release ships package.json +
    #    package-lock.json but no node_modules). PATH was refreshed in step 0.
    Write-Step 'Updating server dependencies'
    Push-Location $ServerDir
    & npm install --omit=dev --no-audit --no-fund 2>&1 | Out-Host
    $npmExit = $LASTEXITCODE
    Pop-Location
    if ($npmExit -ne 0) { throw "npm install failed with exit code $npmExit." }

    # 6. Restart: prefer the tray when it was running; otherwise headless
    Write-Step 'Restarting server'
    Restart-WallBoardServer -TrayWasRunning $trayWasRunning
    $restarted = $true

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
        # The new version copied in but won't come up healthy — roll back to the
        # snapshot so the kiosk runs the previous (known-good) build.
        Write-Warning 'New version did not become healthy within 60s - rolling back to the previous build.'
        Stop-WallBoardServer | Out-Null
        Start-Sleep -Seconds 1
        foreach ($item in $rollbackItems) {
            $snap = Join-Path $rollbackDir $item
            $dst = Join-Path $RepoRoot $item
            if (Test-Path $snap) {
                if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
                New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
                Copy-Item $snap $dst -Recurse -Force
            }
        }
        Push-Location $ServerDir
        & npm install --omit=dev --no-audit --no-fund 2>&1 | Out-Host
        Pop-Location
        Restart-WallBoardServer -TrayWasRunning $trayWasRunning
        $rbWaited = 0
        do { Start-Sleep -Seconds 2; $rbWaited += 2 } until ((Test-WallBoardHealthy) -or ($rbWaited -ge 60))
        if (Test-WallBoardHealthy) {
            Write-Warning "Rolled back to the previous build (healthy). The update to $($rel.tag_name) did NOT take - check update.log."
        } else {
            Write-Warning 'Rollback did not become healthy either. Re-run Update-FromRelease.bat as Administrator and check update.log.'
        }
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
} catch {
    Write-Warning "Update failed: $($_.Exception.Message)"
    # If we already stopped the server but never reached the restart, bring the
    # existing (old) version back up so the kiosk is not left down with the tray
    # task disabled. Manual recovery would otherwise be required.
    if ($serverStopped -and -not $restarted) {
        Write-Warning 'Restarting the existing version so the board is not left down...'
        try {
            Restart-WallBoardServer -TrayWasRunning $trayWasRunning
        } catch {
            Write-Warning "Recovery restart also failed: $($_.Exception.Message). Re-run Update-FromRelease.bat as Administrator."
        }
    }
    throw
} finally {
    Stop-Transcript | Out-Null
}
