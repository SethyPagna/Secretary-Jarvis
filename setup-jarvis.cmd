@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0ops\run\desktop\setup-jarvis.ps1" %*
exit /b %ERRORLEVEL%
