@echo off
title PrintKurox - Disable Auto-Start on PC Boot
cd /d "%~dp0"
color 0C
cls

echo ================================================================
echo       PRINTKUROX STATION -- DISABLE AUTO-START ON PC BOOT
echo ================================================================
echo.

set "SC1=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PrintKurox_Station.lnk"
set "SC2=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PrintKurox_Hostel_AlwaysOnline.lnk"

set REMOVED=0
if exist "%SC1%" (
    del /f /q "%SC1%"
    set REMOVED=1
)
if exist "%SC2%" (
    del /f /q "%SC2%"
    set REMOVED=1
)

if "%REMOVED%"=="1" (
    echo [SUCCESS] Auto-Start shortcuts successfully removed from Windows Startup.
    echo PrintKurox will no longer launch automatically on Windows boot.
) else (
    echo [INFO] Auto-Start was not configured or already removed.
)

echo.
echo ================================================================
pause
