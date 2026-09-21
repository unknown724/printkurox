@echo off
title PrintKurox - Disable Hostel Auto-Start
cd /d "%~dp0"
color 0C
cls

echo ================================================================
echo    PRINTKUROX HOSTEL STATION -- DISABLE AUTO-START
echo ================================================================
echo.

set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PrintKurox_Hostel_AlwaysOnline.lnk"

if exist "%SHORTCUT_PATH%" (
    del /f /q "%SHORTCUT_PATH%"
    echo [SUCCESS] Auto-Start shortcut removed from Windows Startup.
    echo The Always-Online Keepalive will no longer launch automatically.
    echo.
) else (
    echo [INFO] Auto-Start was not enabled or already removed.
    echo.
)

echo ================================================================
pause
