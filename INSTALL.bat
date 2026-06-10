@echo off
title VRSI WallBoard - Install
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "SCRIPT=%~dp0scripts\windows\Install-WallBoard.ps1"

REM --- Self-elevate via UAC if not already Administrator ---
REM Re-launch THIS .bat elevated so the pause below runs in the admin window.
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Requesting Administrator approval...
  set "SELF=%~f0"
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath $env:SELF -Verb RunAs"
  exit /b
)

REM --- Already elevated: run the installer ---
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"

echo.
pause
