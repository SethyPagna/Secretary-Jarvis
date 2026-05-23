@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%jarvis-docker-models.ps1" %*
exit /b %ERRORLEVEL%
