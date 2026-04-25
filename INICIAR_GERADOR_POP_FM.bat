@echo off
setlocal
cd /d "%~dp0"

title Gerador POP FM
echo Iniciando Gerador POP FM...
echo.

if exist "C:\Users\netto\AppData\Local\Programs\Python\Python310\python.exe" (
  "C:\Users\netto\AppData\Local\Programs\Python\Python310\python.exe" run.py
) else (
  python run.py
)

echo.
echo O Gerador POP FM foi encerrado.
pause
