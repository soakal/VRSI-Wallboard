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

# Re-enable the tray task (if it exists) and start the server again. Used on the
# success path AND on failure recovery, so a half-failed update never leaves the
# kiosk down with the tray task disabled.
#
# Always launches via the tray (crash + hang auto-restart), regardless of whether
# the tray was running before the update — the tray is the only supported
# production path. The headless service is a last resort, only used if
# Start-TrayApp.bat itself is missing.
function Restart-WallBoardServer {
    # Always re-enable the logon task if it exists — the task's existence, not a
    # live mutex, is the right signal that this is a tray install. Enabling does
    # not launch anything now; it only governs the next logon.
    if (Get-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue) {
        Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
    }
    $trayBat = Join-Path $RepoRoot 'Start-TrayApp.bat'
    if (Test-Path $trayBat) {
        Start-Process 'cmd.exe' -ArgumentList "/c `"$trayBat`"" -WindowStyle Hidden
        return
    }
    Write-Warning "Start-TrayApp.bat not found at $trayBat - falling back to the headless service (no crash/hang auto-restart)."
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

# Fail fast (BEFORE stopping the server) if the kiosk user lacks write access to
# the install dir — otherwise Copy-Item fails AFTER the board is already down,
# needing manual recovery. Missing Modify on the install folder is the Update
# button's most common real-world failure.
function Assert-Writable {
    param([string]$Dir)
    if (-not (Test-Path $Dir)) { throw "Install directory not found: $Dir" }
    $probe = Join-Path $Dir ('.vrsi-write-test-' + [guid]::NewGuid().ToString('N'))
    try {
        Set-Content -Path $probe -Value 'ok' -ErrorAction Stop
        Remove-Item $probe -Force -ErrorAction SilentlyContinue
        Write-Host "  Write access to $Dir OK"
    } catch {
        throw "No write permission to '$Dir'. The kiosk user needs Modify on the install folder. Update aborted; the current version keeps running."
    }
}

# npm install over a flaky kiosk network fails intermittently; retry a few times
# before giving up. Throws if every attempt fails.
function Invoke-NpmInstall {
    param([int]$Attempts = 3)
    for ($i = 1; $i -le $Attempts; $i++) {
        & npm install --omit=dev --no-audit --no-fund 2>&1 | Out-Host
        if ($LASTEXITCODE -eq 0) { return }
        Write-Warning "npm install attempt $i/$Attempts failed (exit $LASTEXITCODE)."
        if ($i -lt $Attempts) { Start-Sleep -Seconds 5 }
    }
    throw "npm install failed after $Attempts attempts."
}

# Restore the pre-update snapshot (dist + manifests) and reinstall deps so the
# kiosk runs the previous known-good build. Shared by the unhealthy-new-build
# path AND the catch block — the catch must roll the half-applied files back
# rather than restart a partially-overwritten tree.
function Invoke-Rollback {
    if (-not $snapshotTaken -or -not $rollbackDir -or -not (Test-Path $rollbackDir)) { return }
    Write-Warning 'Rolling back to the previous build...'
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
    try { Invoke-NpmInstall } catch { Write-Warning "Rollback npm install failed: $($_.Exception.Message)" }
    Pop-Location
}

# Recovery state: if we stop the server and then a later step throws, the catch
# block must bring the existing version back up (rolling back first if needed).
$serverStopped = $false
$restarted = $false
$trayWasRunning = $false
$taskDisabled = $false
$rollbackDir = $null
$rollbackItems = @('server\dist', 'client\dist', 'shared\dist', 'server\package.json', 'server\package-lock.json')
$snapshotTaken = $false

try {
    Write-Host ''
    Write-Host '  VRSI WallBoard - Update from GitHub release' -ForegroundColor Cyan
    Write-Host '  ===========================================' -ForegroundColor Cyan
    Write-Host ''

    # GUARD: never run the release path on a real git/dev checkout. Validate with
    # git itself (not just ".git" existence) so stale/partial git markers on old
    # release installs do not block this updater forever.
    $isGitCheckout = $false
    try {
        & git -C $RepoRoot rev-parse --is-inside-work-tree *> $null
        $isGitCheckout = ($LASTEXITCODE -eq 0)
    } catch {
        $isGitCheckout = $false
    }
    if ($isGitCheckout) {
        throw "Refusing to run the release updater on a git checkout ($RepoRoot). Use Update-WallBoard.ps1 (git pull) instead."
    }

    # 0. Refresh PATH from the registry (this can run from a context without it),
    #    then fail fast if Node is missing/incompatible BEFORE touching anything.
    $_mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $_up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ((@($_mp, $_up) | Where-Object { $_ }) -join ';')
    Assert-NodeCompatible
    Assert-Writable $RepoRoot

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
        # Only disable if not already Disabled, so $taskDisabled records that THIS
        # run owns re-enabling it.
        if ((Get-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue).State -ne 'Disabled') {
            Disable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
            $taskDisabled = $true
        }
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
    foreach ($item in $rollbackItems) {
        $src = Join-Path $RepoRoot $item
        if (Test-Path $src) {
            $dst = Join-Path $rollbackDir $item
            New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
            Copy-Item $src $dst -Recurse -Force
        }
    }
    $snapshotTaken = $true

    # 4. Copy the new files over the install (data lives in ProgramData and
    #    server\.env is not part of the release zip, so both are untouched)
    Write-Step "Copying new files over $RepoRoot"
    Copy-Item -Path (Join-Path $newRoot '*') -Destination $RepoRoot -Recurse -Force

    # 4b. Remove stale server\src and shared\src left behind by older release zips
    #     (≤ v1.1.0 incorrectly included src). Copy-Item above is additive and won't
    #     delete them. Their presence would route future updates to the git-pull path.
    foreach ($stale in @('server\src', 'shared\src')) {
        $stalePath = Join-Path $RepoRoot $stale
        if (Test-Path $stalePath) {
            Remove-Item $stalePath -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Removed stale $stale" -ForegroundColor DarkGray
        }
    }

    # 5. Update server dependencies (the release ships package.json +
    #    package-lock.json but no node_modules). PATH was refreshed in step 0.
    Write-Step 'Updating server dependencies'
    Push-Location $ServerDir
    try { Invoke-NpmInstall } finally { Pop-Location }

    # Ensure product support inbox is in server\.env (safe to add if missing).
    Ensure-SupportEmailInEnv

    # 6. Restart: prefer the tray when it was running; otherwise headless
    Write-Step 'Restarting server'
    Restart-WallBoardServer
    $restarted = $true

    # 7. Wait for the server to come back
    Write-Step 'Waiting for server to be ready'
    $waited = 0
    do {
        Start-Sleep -Seconds 2
        $waited += 2
    } until ((Test-WallBoardHealthy) -or ($waited -ge 60))
    $finalOk = $false
    $finalMsg = ''
    if (Test-WallBoardHealthy) {
        Write-Host "Server healthy at $WallBoardUrl" -ForegroundColor Green
        $finalOk = $true
        $finalMsg = "Update to $($rel.tag_name) complete."
    } else {
        # The new version copied in but won't come up healthy — roll back to the
        # snapshot so the kiosk runs the previous (known-good) build.
        Write-Warning 'New version did not become healthy within 60s - rolling back to the previous build.'
        Stop-WallBoardServer | Out-Null
        Start-Sleep -Seconds 1
        Invoke-Rollback
        Restart-WallBoardServer
        $rbWaited = 0
        do { Start-Sleep -Seconds 2; $rbWaited += 2 } until ((Test-WallBoardHealthy) -or ($rbWaited -ge 60))
        if (Test-WallBoardHealthy) {
            Write-Warning "Rolled back to the previous build (healthy). The update to $($rel.tag_name) did NOT take - check update.log."
            $finalMsg = "Update to $($rel.tag_name) failed; rolled back to the previous (working) build. Check update.log."
        } else {
            Write-Warning 'Rollback did not become healthy either. Re-run Update-FromRelease.bat as Administrator and check update.log.'
            $finalMsg = 'Update failed AND rollback did not come back healthy. Re-run Update-FromRelease.bat as Administrator.'
        }
    }

    # 8. Restart the board browser so it loads the new version. Only kill the
    #    dedicated board WINDOW (--app= or legacy --kiosk) pointing at
    #    localhost:3001 — never a regular browser where the board is just one tab.
    Write-Step 'Restarting board browser'
    $kioskBrowsers = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" |
        Where-Object { $_.CommandLine -like '*localhost:3001*' -and ($_.CommandLine -like '*--app*' -or $_.CommandLine -like '*--kiosk*') }
    if ($kioskBrowsers) {
        $kioskBrowsers | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
        & (Join-Path $PSScriptRoot 'Start-Kiosk.ps1')
    }

    # 9. Clean up the temp download
    Remove-Item $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ''
    if ($finalOk) {
        Write-Host $finalMsg -ForegroundColor Green
    } else {
        Write-Warning $finalMsg
    }
    Write-UpdateStatus -Ok $finalOk -Message $finalMsg
    Write-Host ''
    if (-not $Unattended) { Start-Sleep -Seconds 3 }
} catch {
    Write-Warning "Update failed: $($_.Exception.Message)"
    Write-UpdateStatus -Ok $false -Message "Update failed: $($_.Exception.Message)"
    # The tray task is the sole logon launcher; if THIS run disabled it, re-enable
    # it even when the failure happened before the server was stopped, so the tray
    # still auto-starts at next logon.
    if ($taskDisabled -and -not $restarted) {
        Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue | Out-Null
    }
    # If we already stopped the server but never reached the restart, roll any
    # half-applied files back to the snapshot FIRST (so we never restart a
    # partially-overwritten tree), then bring the previous version back up so the
    # kiosk is not left down with the tray task disabled.
    if ($serverStopped -and -not $restarted) {
        Write-Warning 'Restoring the previous version so the board is not left down...'
        try {
            Invoke-Rollback
            Restart-WallBoardServer
        } catch {
            Write-Warning "Recovery restart also failed: $($_.Exception.Message). Re-run Update-FromRelease.bat as Administrator."
        }
    }
    throw
} finally {
    # Enabled is the correct steady state for the logon task; restore it on EVERY
    # exit path (success, caught failure, rethrow) so an update can never leave the
    # tray unable to start at logon. Idempotent; only attempted if the task exists.
    if (Get-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction SilentlyContinue) {
        try { Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray' -ErrorAction Stop | Out-Null }
        catch { Write-Warning "Could not re-enable 'VRSI WallBoard Tray' task: $($_.Exception.Message)" }
    }
    Stop-Transcript | Out-Null
}
