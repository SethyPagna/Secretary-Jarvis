@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0setup-jarvis.ps1" %*
exit /b %ERRORLEVEL%
