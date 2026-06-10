@echo off
title VRSI WallBoard Server
cd /d "%~dp0"
call "%~dp0_run.ps1.bat" "Start-WallBoard-Service.ps1"
