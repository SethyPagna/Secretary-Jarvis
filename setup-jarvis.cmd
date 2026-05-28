@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0run\desktop\setup-jarvis.ps1" %*
exit /b %ERRORLEVEL%
