@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CRIAR_ATALHOS_APP.ps1"

echo.
pause
