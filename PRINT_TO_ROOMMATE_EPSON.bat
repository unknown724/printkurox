@echo off
setlocal enabledelayedexpansion
title PrintKurox - Direct Print to Roommate EPSON L3210
cd /d "%~dp0"

echo ============================================================
echo      PRINTKUROX 1-CLICK PRINT (Roommate EPSON L3210)        
echo ============================================================
echo.

set "TARGET_FILE=%~1"

:: If no file was dragged onto the bat file, open a GUI File Browser
if "%TARGET_FILE%"=="" (
    echo [INFO] No file dropped. Opening file selector...
    for /f "usebackq delims=" %%F in (`powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\choose_file.ps1"`) do (
        set "TARGET_FILE=%%F"
    )
)

if "%TARGET_FILE%"=="" goto cancelled
if "%TARGET_FILE%"=="CANCELLED" goto cancelled

echo Selected file: "%TARGET_FILE%"
echo.

node scripts\direct_print.js "%TARGET_FILE%"

echo.
pause
exit /b 0

:cancelled
echo.
echo [INFO] No file selected. Printing cancelled.
echo.
pause
exit /b 0
