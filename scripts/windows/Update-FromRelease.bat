@echo off
echo.
echo  WARNING: This updater is for RELEASE installs only (no .git folder, no server\src).
echo  For developer git-clone installs, run Update-WallBoard.bat instead.
echo  The script will automatically abort if run on a git checkout.
echo.
call "%~dp0_run.ps1.bat" "Update-FromRelease.ps1"
