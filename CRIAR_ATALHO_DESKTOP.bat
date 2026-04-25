@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CRIAR_ATALHO_DESKTOP.ps1"

echo.
pause
