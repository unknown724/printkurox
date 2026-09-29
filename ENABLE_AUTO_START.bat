@echo off
title PrintKurox - Enable Auto-Start on PC Boot
cd /d "%~dp0"
color 0A
cls

echo ================================================================
echo    PRINTKUROX STATION -- ENABLE AUTO-START ON PC BOOT
echo ================================================================
echo.
echo This will configure Windows to automatically launch the
echo PrintKurox Station Connector whenever this PC turns on or reboots.
echo.

set "TARGET_VBS=%~dp0START_BACKGROUND.vbs"
set "TARGET_EXE=%~dp0connector.exe"

set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PrintKurox_Station.lnk"
set "VBS_SCRIPT=%TEMP%\make_kurox_sc_%RANDOM%.vbs"

(
echo Set ws = CreateObject("WScript.Shell"^)
echo Set sc = ws.CreateShortcut("%SHORTCUT_PATH%"^)
if exist "%TARGET_VBS%" (
    echo sc.TargetPath = "wscript.exe"
    echo sc.Arguments = """%TARGET_VBS%"""
    echo sc.WindowStyle = 0
) else if exist "%TARGET_EXE%" (
    echo sc.TargetPath = "%TARGET_EXE%"
    echo sc.WindowStyle = 7
) else (
    echo sc.TargetPath = "%~dp0START_PRINTKUROX.bat"
    echo sc.WindowStyle = 7
)
echo sc.WorkingDirectory = "%~dp0"
echo sc.Description = "PrintKurox Smart Printing Station Connector (Silent Background)"
echo sc.Save
) > "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%" >nul 2>&1

if exist "%SHORTCUT_PATH%" (
    echo.
    echo [SUCCESS] Auto-Start is now ENABLED!
    echo.
    echo Whenever this PC powers on or restarts:
    echo   PrintKurox Station Connector will launch automatically
    echo   and start accepting student print orders.
    echo.
) else (
    echo.
    echo [ERROR] Failed to create startup shortcut.
    echo.
)

echo ================================================================
pause
