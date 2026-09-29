@echo off
title PrintKurox Kiosk Station - Complete Uninstaller
color 0C
echo ========================================================================
echo                 PRINTKUROX KIOSK COMPLETE UNINSTALLER
echo ========================================================================
echo.
echo This utility will:
echo   1. Stop all PrintKurox background services (watchdog, keepalive, spooler)
echo   2. Remove the Windows automatic startup shortcut
echo   3. Remove local station credentials and configuration
echo.
set /p CONFIRM="Are you sure you want to completely uninstall PrintKurox from this PC? (Y/N): "
if /i "%CONFIRM%" neq "Y" (
    echo [ABORTED] No changes made.
    pause
    exit /b 0
)

echo.
echo [*] Terminating running background processes...
powershell -NoProfile -Command "$p = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*station_keepalive*' -or $_.CommandLine -like '*HOSTEL_ALWAYS_ONLINE*' }; if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force } }" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq PrintKurox*" >nul 2>&1
taskkill /f /im connector.exe >nul 2>&1
taskkill /f /im PrintKurox.exe >nul 2>&1

echo [*] Removing Windows Startup shortcut...
set "STARTUP_LNK1=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PrintKurox_Hostel_AlwaysOnline.lnk"
set "STARTUP_LNK2=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PrintKurox_Station.lnk"
if exist "%STARTUP_LNK1%" del /f /q "%STARTUP_LNK1%"
if exist "%STARTUP_LNK2%" del /f /q "%STARTUP_LNK2%"
echo [+] Startup shortcuts removed.

echo [*] Cleaning local configuration and credentials...
if exist "%~dp0daemon\.env" del /f /q "%~dp0daemon\.env"
if exist "%~dp0.env" del /f /q "%~dp0.env"
if exist "%~dp0station_config.json" del /f /q "%~dp0station_config.json"
if exist "%~dp0LOGIN_INFO.txt" del /f /q "%~dp0LOGIN_INFO.txt"
if exist "%~dp0temp_prints" rmdir /s /q "%~dp0temp_prints" >nul 2>&1
echo [+] Local configuration cleanly removed.

echo.
echo ========================================================================
echo [+] UNINSTALL COMPLETE!
echo PrintKurox background services and startup entries have been removed.
echo Your computer will no longer run print kiosk services.
echo ========================================================================
echo.
pause
