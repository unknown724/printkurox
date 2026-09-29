@echo off
title PrintKurox Station Connector
color 0A
cd /d "%~dp0"

echo ========================================================================
echo                 PRINTKUROX SMART PRINTING STATION
echo ========================================================================
echo.

if not exist "station_config.json" (
    echo [NOTICE] Station configuration not found. Launching Setup Wizard...
    if exist "PrintKurox_Setup.exe" (
        start "" "PrintKurox_Setup.exe"
        exit /b 0
    )
)

if exist "PrintKurox.exe" (
    echo Starting PrintKurox Station...
    start "" "PrintKurox.exe"
    exit /b 0
)

if exist "connector.exe" (
    echo Starting PrintKurox Station Connector...
    "connector.exe"
) else (
    echo [ERROR] PrintKurox.exe or connector.exe was not found in this directory!
    pause
)
