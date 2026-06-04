@echo off
title VRSI WallBoard - Backup Now
call "%~dp0_run.ps1.bat" "Invoke-WallBoardBackup.ps1"
echo.
pause
