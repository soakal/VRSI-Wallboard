@echo off
title VRSI WallBoard - Restart
cd /d "%~dp0"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Restart-WallBoard.ps1"
echo.
pause
