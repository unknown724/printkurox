@echo off
title PrintKurox Hostel Station — Always-Online Keepalive
cd /d "%~dp0daemon"

:: Check Python
python -V >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

python station_keepalive.py
pause
