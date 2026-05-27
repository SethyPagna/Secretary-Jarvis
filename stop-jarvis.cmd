@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0run\desktop\stop-jarvis.ps1" %*
exit /b %ERRORLEVEL%
