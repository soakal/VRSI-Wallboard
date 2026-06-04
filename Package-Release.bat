@echo off
title VRSI WallBoard - Package Release
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "SCRIPT=%~dp0scripts\windows\Package-Release.ps1"

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"

echo.
pause
