# Open Edge or Chrome as a normal WINDOW pointing at the WallBoard.
# Start the server first (Start-WallBoard.ps1).
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

if (-not (Test-WallBoardHealthy)) {
    Write-Warning "WallBoard is not responding at $WallBoardUrl  -  start Start-WallBoard.ps1 first."
    Start-Sleep -Seconds 3
}

$url = $WallBoardUrl

# App-window mode (--app=) instead of fullscreen kiosk: opens a normal,
# minimizable, resizable window with its own taskbar button and no tabs/address
# bar. The employee can minimize it and keep working, then click the taskbar
# button to bring the board back. (Old behaviour was --kiosk fullscreen lock.)
$candidates = @(
    @{ Name = 'Edge';   Path = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"; Args = @("--app=$url", '--window-size=1600,900', '--no-first-run') },
    @{ Name = 'Edge';   Path = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe";        Args = @("--app=$url", '--window-size=1600,900', '--no-first-run') },
    @{ Name = 'Chrome'; Path = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe";          Args = @("--app=$url", '--window-size=1600,900', '--no-first-run') },
    @{ Name = 'Chrome'; Path = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe";   Args = @("--app=$url", '--window-size=1600,900', '--no-first-run') }
)

foreach ($b in $candidates) {
    if (Test-Path $b.Path) {
        Write-Step "Launching $($b.Name) window -> $url"
        Start-Process -FilePath $b.Path -ArgumentList $b.Args
        exit 0
    }
}

throw 'No Edge or Chrome found. Install a browser or open ' + $url + ' manually.'
