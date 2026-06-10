@echo off
title VRSI WallBoard Tray
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

where node >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo Node.js is not installed. Run INSTALL.bat first, or install
  echo the LTS version from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

start "" "%SystemRoot%\System32\conhost.exe" --headless "%PS%" -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0Start-TrayApp.ps1"

exit /b 0
