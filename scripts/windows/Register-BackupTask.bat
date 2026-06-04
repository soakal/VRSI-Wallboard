@echo off
title VRSI WallBoard - Register Backup Task
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo This script needs Administrator rights.
  echo Right-click the file and choose "Run as administrator".
  pause
  exit /b 1
)
call "%~dp0_run.ps1.bat" "Register-BackupTask.ps1"
echo.
pause
