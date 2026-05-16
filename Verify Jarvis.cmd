@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jarvis-runtime.ps1" -Action Verify
echo.
echo Verification finished.
echo Press any key to close this launcher.
pause >nul
