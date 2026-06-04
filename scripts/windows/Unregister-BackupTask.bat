@echo off
title VRSI WallBoard - Remove Backup Schedule
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Run as Administrator to remove the scheduled task.
  pause
  exit /b 1
)
call "%~dp0_run.ps1.bat" "Unregister-BackupTask.ps1"
pause
