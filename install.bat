@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\mizan.ps1" install %*
if errorlevel 1 exit /b 1
