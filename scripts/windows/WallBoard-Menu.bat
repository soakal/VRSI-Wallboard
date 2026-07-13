@echo off
title VRSI WallBoard
:menu
cls
echo ========================================
echo        VRSI WallBoard - Menu
echo ========================================
echo.
echo  SETUP
echo   I  Install (same as INSTALL.bat in project root)
echo   1  First-time setup (legacy)
echo   2  Install data folders only
echo   3  Build production
echo.
echo  RUN
echo   T  Start tray app (production - server + auto-restart, icon near clock)
echo   4  Start server (console - debug only, no auto-restart)
echo   5  Start kiosk browser
echo   S  Stop server
echo   P  Update to latest version (auto-detects git vs release install)
echo   9  Open http://localhost:3001
echo   M  IT Report (open board + Ctrl+M hint)
echo.
echo  BACKUPS
echo   6  Backup now
echo   L  List backups
echo   F  Open backups folder
echo   R  Restore from backup
echo   7  Register backup task (Admin)
echo   U  Unregister backup task (Admin)
echo.
echo  STARTUP / REMOVAL
echo   8  Register startup tasks (Admin)
echo   X  Uninstall (tasks + optional data)
echo.
echo   0  Exit
echo.
set "CHOICE="
set /p CHOICE="Choose: "

if /i "%CHOICE%"=="I" call "%~dp0Install-WallBoard.bat" & goto menu
if /i "%CHOICE%"=="1" call "%~dp0Setup-FirstTime.bat" & goto menu
if /i "%CHOICE%"=="2" call "%~dp0Install-DataDirs.bat" & goto menu
if /i "%CHOICE%"=="3" call "%~dp0Build-Production.bat" & goto menu
if /i "%CHOICE%"=="4" call "%~dp0Start-WallBoard.bat" & goto menu
if /i "%CHOICE%"=="T" call "%~dp0Start-TrayApp.bat" & goto menu
if /i "%CHOICE%"=="5" call "%~dp0Start-Kiosk.bat" & goto menu
if /i "%CHOICE%"=="S" call "%~dp0Stop-WallBoard.bat" & goto menu
if /i "%CHOICE%"=="P" call :doupdate & goto menu
if /i "%CHOICE%"=="6" call "%~dp0Backup-Now.bat" & goto menu
if /i "%CHOICE%"=="L" call "%~dp0List-Backups.bat" & goto menu
if /i "%CHOICE%"=="F" call "%~dp0Open-Backups-Folder.bat" & goto menu
if /i "%CHOICE%"=="R" call "%~dp0Restore-Backup.bat" & goto menu
if /i "%CHOICE%"=="7" call "%~dp0Register-BackupTask.bat" & goto menu
if /i "%CHOICE%"=="U" call "%~dp0Unregister-BackupTask.bat" & goto menu
if /i "%CHOICE%"=="8" call "%~dp0Register-StartupTasks.bat" & goto menu
if /i "%CHOICE%"=="X" call "%~dp0Uninstall-WallBoard.bat" & goto menu
if /i "%CHOICE%"=="9" start http://localhost:3001 & goto menu
if /i "%CHOICE%"=="M" call "%~dp0Open-IT-Report.bat" & goto menu
if /i "%CHOICE%"=="0" exit /b 0

echo Invalid choice.
pause
goto menu

:doupdate
rem Git clones update via pull + rebuild; release-folder installs download
rem the latest GitHub release zip.
if exist "%~dp0..\..\.git" (
  call "%~dp0Update-WallBoard.bat"
) else (
  call "%~dp0Update-FromRelease.bat"
)
goto :eof
