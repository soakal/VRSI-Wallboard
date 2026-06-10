@echo off
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "PS1=%~1"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0%PS1%"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Failed with exit code %EXITCODE%.
  pause
  exit /b %EXITCODE%
)
exit /b 0
