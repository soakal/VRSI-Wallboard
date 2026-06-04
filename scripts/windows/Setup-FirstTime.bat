@echo off
title VRSI WallBoard - First-Time Setup
setlocal
set "ROOT=%~dp0..\.."
set "SERVER_ENV=%ROOT%\server\.env"
set "ENV_EXAMPLE=%ROOT%\server\.env.production.example"

echo ========================================
echo   VRSI WallBoard - First-Time Setup
echo ========================================
echo.

call "%~dp0_run.ps1.bat" "Install-DataDirs.ps1"
if errorlevel 1 exit /b 1

if not exist "%SERVER_ENV%" (
  if exist "%ENV_EXAMPLE%" (
    echo Creating server\.env from production example...
    copy /Y "%ENV_EXAMPLE%" "%SERVER_ENV%" >nul
    echo.
    echo IMPORTANT: Edit server\.env and set ADMIN_TOKEN before going live.
    echo Opening server\.env in Notepad...
    notepad "%SERVER_ENV%"
  ) else (
    echo ERROR: Missing server\.env.production.example
    pause
    exit /b 1
  )
) else (
  echo server\.env already exists - skipping copy.
)

echo.
echo Building client and server (may take a few minutes)...
call "%~dp0_run.ps1.bat" "Build-Production.ps1"
if errorlevel 1 exit /b 1

echo.
echo ========================================
echo   Setup complete
echo ========================================
echo.
echo Next steps:
echo   1. Double-click Start-WallBoard.bat
echo   2. Double-click Start-Kiosk.bat
echo.
echo Optional (Run as Administrator):
echo   Register-BackupTask.bat
echo   Register-StartupTasks.bat
echo.
pause
