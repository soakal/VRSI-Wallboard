@echo off
title VRSI WallBoard - Install
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "SCRIPT=%~dp0scripts\windows\Install-WallBoard.ps1"

REM --- Check Node.js is installed before doing anything else ---
where node >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo Node.js is not installed.
  echo.
  echo   1. Download the LTS installer from https://nodejs.org
  echo   2. Run it and leave "Add to PATH" checked.
  echo   3. Close this window, open a NEW one, and run INSTALL.bat again.
  echo.
  pause
  exit /b 1
)

REM --- Self-elevate via UAC if not already Administrator ---
REM Re-launch THIS .bat elevated so the pause below runs in the admin window.
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Requesting Administrator approval...
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

REM --- Already elevated: run the installer ---
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"

echo.
pause
