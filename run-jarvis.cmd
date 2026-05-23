@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0run-jarvis.ps1" %*
exit /b %ERRORLEVEL%
