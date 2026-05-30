@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0ops\run\desktop\run-jarvis.ps1" %*
exit /b %ERRORLEVEL%
