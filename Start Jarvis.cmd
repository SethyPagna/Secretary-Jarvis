@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jarvis-control.ps1" -Action Start
echo.
echo Jarvis startup was requested. The HUD should appear as the centered orb.
echo Press any key to close this launcher.
pause >nul
