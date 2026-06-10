. "$PSScriptRoot\_common.ps1"

# Refresh PATH from registry - Task Scheduler with -NoProfile does not load the
# user profile, so winget/MSI installs that write to User PATH are invisible.
# Reading both Machine and User PATH from the registry fixes node.exe lookup.
$_mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
$_up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$env:Path = ((@($_mp, $_up) | Where-Object { $_ }) -join ';')
Remove-Variable _mp, _up -ErrorAction SilentlyContinue

$ErrorActionPreference = 'Stop'

# STA guard - NotifyIcon/WinForms requires single-threaded apartment.
# Relaunch via conhost --headless so the new instance never gets a taskbar window.
if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne 'STA') {
    Start-Process "$env:SystemRoot\System32\conhost.exe" -ArgumentList "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File `"$PSCommandPath`""
    exit
}

# Single-instance guard via named mutex (Restart-WallBoard.ps1 probes this exact name)
$_createdNew = $false
$script:TrayMutex = New-Object System.Threading.Mutex($true, 'VRSIWallBoardTray', [ref]$_createdNew)
if (-not $_createdNew) {
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

# ---- Startup log - writes to ProgramData logs dir for diagnosing hidden-task failures ----
function Write-TrayLog([string]$Level, [string]$Msg) {
    try {
        $logDir = Get-EnvValue 'LOGS_DIR' 'C:\ProgramData\VRSIWallBoard\logs'
        if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
        $logFile = Join-Path $logDir 'tray-startup.log'
        # Rotate at 1 MB to prevent unbounded growth on always-on kiosks
        if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 1MB) {
            Move-Item $logFile "$logFile.old" -Force -ErrorAction SilentlyContinue
        }
        $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        "$stamp  [$Level]  $Msg" | Add-Content -Path $logFile -Encoding UTF8 -ErrorAction SilentlyContinue
    } catch { }
}

# ---- Pre-flight ----
Write-TrayLog 'INFO' "Tray starting. PATH=$env:Path"
try {
    Ensure-ServerEnv | Out-Null

    $distIndex = Join-Path $ServerDir 'dist\index.js'
    if (-not (Test-Path $distIndex)) {
        [System.Windows.Forms.MessageBox]::Show('WallBoard is building for first use. Click OK and wait - the tray icon will appear when ready.', 'VRSI WallBoard', 'OK', 'Information') | Out-Null
        & (Join-Path $PSScriptRoot 'Build-Production.ps1')
    }
} catch {
    $msg = $_.Exception.Message
    Write-TrayLog 'ERROR' "Pre-flight failed: $msg"
    [System.Windows.Forms.MessageBox]::Show("WallBoard tray failed to start: $msg", 'VRSI WallBoard', 'OK', 'Error') | Out-Null
    exit 1
}

# ---- Build tray icon programmatically (32x32 blue circle + white "W") ----
$bmp = New-Object System.Drawing.Bitmap(32, 32)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.SmoothingMode    = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gfx.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

$blueBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0, 102, 204))
$gfx.FillEllipse($blueBrush, 1, 1, 30, 30)
$blueBrush.Dispose()

$font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$sf   = New-Object System.Drawing.StringFormat
$sf.Alignment     = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$gfx.DrawString('W', $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(0, 0, 32, 32), $sf)
$font.Dispose()
$sf.Dispose()
$gfx.Dispose()

$script:TrayIcon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$bmp.Dispose()

# ---- State ----
$script:ServerProcess    = $null
$script:Stopping         = $false
$script:RestartTimes     = New-Object System.Collections.Generic.List[datetime]
$script:CrashLoopNotified = $false

# ---- Helper: show balloon notification ----
function Show-Balloon {
    param(
        [string]$Message,
        [System.Windows.Forms.ToolTipIcon]$IconType = [System.Windows.Forms.ToolTipIcon]::Info
    )
    $script:Notify.ShowBalloonTip(3000, 'VRSI WallBoard', $Message, $IconType)
}

# ---- Resolve node.exe - fallback to known install locations if PATH lookup fails ----
function Get-NodeExe {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    $fromPath = if ($nodeCmd) { $nodeCmd.Source } else { $null }
    if ($fromPath) { return $fromPath }
    $x86 = ${env:ProgramFiles(x86)}
    foreach ($candidate in @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        'C:\Program Files\nodejs\node.exe',
        (if ($x86) { Join-Path $x86 'nodejs\node.exe' } else { $null }),
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
        "$env:APPDATA\nvm\current\node.exe"
    )) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    # Last resort: walk winget per-user packages for node.exe
    $wingetPkg = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
    if (Test-Path $wingetPkg) {
        $found = Get-ChildItem -Path $wingetPkg -Filter 'node.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    throw "node.exe not found. Install Node.js from https://nodejs.org then restart the tray."
}

# ---- Start the node server process ----
function Start-Server {
    $nodeExe = Get-NodeExe
    $env:NODE_ENV = 'production'
    $script:ServerProcess = Start-Process `
        -FilePath       $nodeExe `
        -ArgumentList   'dist\index.js' `
        -WorkingDirectory $ServerDir `
        -WindowStyle    Hidden `
        -PassThru
}

# ---- Stop the node server process ----
function Stop-Server {
    $script:Stopping = $true
    if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
        Stop-Process -Id $script:ServerProcess.Id -Force -ErrorAction SilentlyContinue
    } else {
        $conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) {
            $serverPid = $conn.OwningProcess
            $proc = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq 'node') {
                Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
            }
        }
    }
    # Note: no sleep here - callers that need the port to free (Restart path) add their own delay
}

# ---- Cleanup: called before closing the app form ----
function Invoke-Cleanup {
    if ($script:MonitorTimer) {
        $script:MonitorTimer.Stop()
        $script:MonitorTimer.Dispose()
    }
    if ($script:Notify) {
        $script:Notify.Visible = $false
        $script:Notify.Dispose()
    }
    if ($script:TrayIcon) {
        $script:TrayIcon.Dispose()
    }
    if ($script:AppForm -and -not $script:AppForm.IsDisposed) {
        $script:AppForm.Close()
    }
    try {
        $script:TrayMutex.ReleaseMutex()
        $script:TrayMutex.Dispose()
    } catch { }
}

# ---- Adopt an already-running server or start fresh ----
$existingConn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingConn) {
    $adoptedProcess = Get-Process -Id $existingConn.OwningProcess -ErrorAction SilentlyContinue
    if ($adoptedProcess -and $adoptedProcess.ProcessName -eq 'node') {
        $script:ServerProcess = $adoptedProcess
    } else {
        # Port squatter is not a WallBoard server - starting would loop-crash with EADDRINUSE
        $squatter = if ($adoptedProcess) { "$($adoptedProcess.ProcessName) (PID $($adoptedProcess.Id))" } else { "PID $($existingConn.OwningProcess)" }
        Write-TrayLog 'WARN' "Port squatter: $squatter"
        [System.Windows.Forms.MessageBox]::Show(
            "Port 3001 is already in use by $squatter - this is not a WallBoard server.`n`nFree port 3001 and try again.",
            'VRSI WallBoard', 'OK', 'Warning') | Out-Null
        Invoke-Cleanup
        exit 1
    }
} else {
    try {
        Write-TrayLog 'INFO' "Starting server. node=$(Get-NodeExe)"
        Start-Server
    } catch {
        $msg = $_.Exception.Message
        Write-TrayLog 'ERROR' "Start-Server failed: $msg"
        [System.Windows.Forms.MessageBox]::Show(
            "Failed to start WallBoard server: $msg`n`nIs Node.js installed?",
            'VRSI WallBoard', 'OK', 'Error') | Out-Null
        Invoke-Cleanup
        exit 1
    }
}

# ---- Build NotifyIcon ----
$script:Notify          = New-Object System.Windows.Forms.NotifyIcon
$script:Notify.Icon     = $script:TrayIcon
$script:Notify.Text     = 'VRSI WallBoard'
$script:Notify.Visible  = $true

# ---- Context menu ----
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$itemOpen = New-Object System.Windows.Forms.ToolStripMenuItem('Open in Browser')
$itemOpen.add_Click({
    try {
        Start-Process $WallBoardUrl
    } catch {
        Show-Balloon "Failed to open browser: $($_.Exception.Message)" ([System.Windows.Forms.ToolTipIcon]::Error)
    }
})

$separator = New-Object System.Windows.Forms.ToolStripSeparator

$itemRestart = New-Object System.Windows.Forms.ToolStripMenuItem('Restart Server')
$itemRestart.add_Click({
    try {
        $script:RestartTimes.Clear()
        $script:CrashLoopNotified = $false
        Stop-Server
        Start-Sleep -Seconds 1   # let port 3001 free before binding again
        Start-Server
        Show-Balloon 'WallBoard server restarted.' ([System.Windows.Forms.ToolTipIcon]::Info)
    } catch {
        Show-Balloon "Failed to restart server: $($_.Exception.Message)" ([System.Windows.Forms.ToolTipIcon]::Error)
    } finally {
        $script:Stopping = $false  # always re-enable watchdog, even if Start-Server threw
    }
})

$itemExit = New-Object System.Windows.Forms.ToolStripMenuItem('Stop && Exit')
$itemExit.add_Click({
    try {
        Stop-Server
        Invoke-Cleanup   # closes $script:AppForm -> exits Application::Run($script:AppForm)
    } catch {
        Show-Balloon "Failed to stop server cleanly: $($_.Exception.Message)" ([System.Windows.Forms.ToolTipIcon]::Error)
    }
})

$menu.Items.Add($itemOpen)    | Out-Null
$menu.Items.Add($separator)   | Out-Null
$menu.Items.Add($itemRestart) | Out-Null
$menu.Items.Add($itemExit)    | Out-Null

$script:Notify.ContextMenuStrip = $menu

# ---- Double-click opens browser ----
$script:Notify.add_DoubleClick({
    Start-Process $WallBoardUrl
})

# ---- Monitor timer (fires on UI thread - System.Windows.Forms.Timer) ----
$script:MonitorTimer          = New-Object System.Windows.Forms.Timer
$script:MonitorTimer.Interval = 5000
$script:MonitorTimer.add_Tick({
    try {
        if ($script:Stopping) { return }
        if (-not $script:ServerProcess -or $script:ServerProcess.HasExited) {
            # Crash-loop protection: max 3 restarts in 60 seconds
            $now    = [datetime]::UtcNow
            $cutoff = $now.AddSeconds(-60)
            # Prune old entries
            $recent = $script:RestartTimes | Where-Object { $_ -ge $cutoff }
            $script:RestartTimes.Clear()
            foreach ($t in $recent) { $script:RestartTimes.Add($t) | Out-Null }

            if ($script:RestartTimes.Count -ge 3) {
                if (-not $script:CrashLoopNotified) {
                    $script:CrashLoopNotified = $true
                    Show-Balloon 'WallBoard server keeps crashing. Check logs in C:\ProgramData\VRSIWallBoard\logs.' ([System.Windows.Forms.ToolTipIcon]::Error)
                }
                return
            }
            $script:CrashLoopNotified = $false

            $script:RestartTimes.Add($now) | Out-Null
            Start-Server
            Show-Balloon 'WallBoard server stopped unexpectedly - restarted.' ([System.Windows.Forms.ToolTipIcon]::Warning)
        }
    } catch {
        Show-Balloon "Failed to restart server: $($_.Exception.Message)" ([System.Windows.Forms.ToolTipIcon]::Error)
    }
})

# ---- Start everything ----
$script:MonitorTimer.Start()

Show-Balloon 'WallBoard server running at http://localhost:3001' ([System.Windows.Forms.ToolTipIcon]::Info)

# ---- Hidden host form - keeps the message loop alive without a taskbar button.
# ShowInTaskbar=false + never Show()ed means no entry appears in the taskbar.
# Application::Run($form) exits cleanly when $form.Close() is called.
$script:AppForm                = New-Object System.Windows.Forms.Form
$script:AppForm.WindowState    = [System.Windows.Forms.FormWindowState]::Minimized
$script:AppForm.ShowInTaskbar  = $false
$script:AppForm.Visible        = $false

[System.Windows.Forms.Application]::Run($script:AppForm)
