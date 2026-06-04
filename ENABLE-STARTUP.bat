@echo off
title VRSI WallBoard - Enable Startup at Logon
cd /d "%~dp0"

net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Requesting Administrator approval...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

call "%~dp0scripts\windows\_run.ps1.bat" "Enable-Startup.ps1"
pause
