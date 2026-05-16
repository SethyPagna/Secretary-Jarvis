@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jarvis-control.ps1" -Action InstallShortcuts
echo.
echo Shortcut setup finished.
echo Press any key to close this launcher.
pause >nul
