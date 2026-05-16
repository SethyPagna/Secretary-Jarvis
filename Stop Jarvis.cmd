@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jarvis-control.ps1" -Action Stop
echo.
echo Jarvis stop was requested. Ollama is kept running by default.
echo Press any key to close this launcher.
pause >nul
