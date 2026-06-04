@echo off
title VRSI WallBoard Server
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "SCRIPT=%~dp0scripts\windows\Start-WallBoard.ps1"

REM --- Node.js is required to run the server ---
where node >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo Node.js is not installed. Run INSTALL.bat first, or install
  echo the LTS version from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

echo Starting VRSI WallBoard on http://localhost:3001
echo Close this window or press Ctrl+C to stop the server.
echo.

REM --- No elevation needed: server binds to 127.0.0.1:3001 ---
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"

echo.
pause
