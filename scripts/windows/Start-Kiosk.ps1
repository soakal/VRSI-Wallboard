# Open Edge or Chrome in kiosk mode pointing at the WallBoard.
# Start the server first (Start-WallBoard.ps1).
. "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

if (-not (Test-WallBoardHealthy)) {
    Write-Warning "WallBoard is not responding at $WallBoardUrl  -  start Start-WallBoard.ps1 first."
    Start-Sleep -Seconds 3
}

$url = $WallBoardUrl

$candidates = @(
    @{ Name = 'Edge'; Path = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"; Args = @('--kiosk', $url, '--edge-kiosk-type=fullscreen', '--no-first-run') },
    @{ Name = 'Edge'; Path = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"; Args = @('--kiosk', $url, '--edge-kiosk-type=fullscreen', '--no-first-run') },
    @{ Name = 'Chrome'; Path = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"; Args = @('--kiosk', $url, '--no-first-run') },
    @{ Name = 'Chrome'; Path = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"; Args = @('--kiosk', $url, '--no-first-run') }
)

foreach ($b in $candidates) {
    if (Test-Path $b.Path) {
        Write-Step "Launching $($b.Name) kiosk -> $url"
        Start-Process -FilePath $b.Path -ArgumentList $b.Args
        exit 0
    }
}

throw 'No Edge or Chrome found. Install a browser or open ' + $url + ' manually in fullscreen (F11).'
