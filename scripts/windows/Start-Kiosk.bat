@echo off
title VRSI WallBoard - Kiosk Browser
call "%~dp0_run.ps1.bat" "Start-Kiosk.ps1"
if errorlevel 1 pause
