@echo off
title PrintKurox - Enable Hostel Auto-Start on Windows Boot
cd /d "%~dp0"
color 0A
cls

echo ================================================================
echo    PRINTKUROX HOSTEL STATION -- ENABLE AUTO-START ON PC BOOT
echo ================================================================
echo.
echo This will configure Windows to automatically launch the
echo Always-Online Keepalive and Campus Wi-Fi Auto-Login whenever
echo this laptop turns on or reboots.
echo.

set "TARGET_BAT=%~dp0HOSTEL_ALWAYS_ONLINE.bat"
set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PrintKurox_Hostel_AlwaysOnline.lnk"
set "VBS_SCRIPT=%TEMP%\make_hostel_sc_%RANDOM%.vbs"

echo Set ws = CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo Set sc = ws.CreateShortcut("%SHORTCUT_PATH%") >> "%VBS_SCRIPT%"
echo sc.TargetPath = "%TARGET_BAT%" >> "%VBS_SCRIPT%"
echo sc.WorkingDirectory = "%~dp0" >> "%VBS_SCRIPT%"
echo sc.Description = "PrintKurox Hostel Station Always-Online Watchdog" >> "%VBS_SCRIPT%"
echo sc.Save >> "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%" >nul 2>&1

if exist "%SHORTCUT_PATH%" (
    echo.
    echo [SUCCESS] Auto-Start is now ENABLED!
    echo.
    echo Whenever this PC powers on or restarts:
    echo   1. WhatsApp Bot starts automatically (Windows Service)
    echo   2. Print Daemon starts automatically (Windows Service)
    echo   3. Campus Wi-Fi Auto-Login and Anti-Sleep start automatically
    echo.
) else (
    echo.
    echo [ERROR] Failed to create startup shortcut.
    echo.
)

echo ================================================================
pause
