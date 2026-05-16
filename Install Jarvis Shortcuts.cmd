@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-shortcuts.ps1" -All
echo.
echo Shortcut setup finished.
echo Press any key to close this launcher.
pause >nul
