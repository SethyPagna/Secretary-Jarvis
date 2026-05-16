@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jarvis-control.ps1" %*
echo.
echo Press any key to close this Jarvis control window.
pause >nul
