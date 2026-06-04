@echo off
title VRSI WallBoard - Enable Startup at Logon
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "SCRIPT=%~dp0scripts\windows\Enable-Startup.ps1"

REM --- Self-elevate via UAC if not already Administrator ---
REM Re-launch THIS .bat elevated so the pause below runs in the admin window.
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Requesting Administrator approval...
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

REM --- Already elevated: register the logon startup task ---
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"

echo.
pause
