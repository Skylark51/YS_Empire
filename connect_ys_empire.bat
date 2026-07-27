@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-agent\connect_ys_empire.ps1"
if errorlevel 1 (
  echo.
  echo YS Empire connection failed. Check the message above.
  pause
  exit /b 1
)

endlocal
