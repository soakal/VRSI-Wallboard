@echo off
title VRSI WallBoard Server
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-WallBoard-Service.ps1"
