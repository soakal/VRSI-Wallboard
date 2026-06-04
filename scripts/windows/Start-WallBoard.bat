@echo off
title VRSI WallBoard Server
echo Starting VRSI WallBoard on http://localhost:3001
echo Close this window to stop the server.
echo.
call "%~dp0_run.ps1.bat" "Start-WallBoard.ps1"
pause
