@echo off
setlocal EnableDelayedExpansion
title NERIST PrintHub -- Hostel Station Setup Wizard
color 0B

cd /d "%~dp0"

echo ===============================================================================
echo                NERIST PRINTHUB -- HOSTEL STATION SETUP WIZARD
echo ===============================================================================
echo  Connect your hostel printer to the official campus cloud print network.
echo  Students can send documents from their phones/laptops directly to your room!
echo ===============================================================================
echo.

echo Select your NERIST Hostel Block:
echo.
echo   [1] Block B -- Pare Hostel (Primary Active - Room 29)
echo   [2] Block C -- Dibang Hostel (Next Planned Station)
echo   [3] Block A -- Tirap Hostel
echo   [4] Block D -- Panyor Hostel
echo   [5] Block E -- Kameng Hostel
echo   [6] Block F -- Lohit Hostel
echo   [7] Block G -- Siang Hostel
echo   [8] Block H -- Kurung-Paniu Hostel
echo   [9] Girls Hostel -- Subansiri
echo   [10] Custom Room / Location
echo.

set /p CHOICE="Enter choice [1-10] (Default: 1): "
if "%CHOICE%"=="" set CHOICE=1

set STATION_ID=block_b
set STATION_NAME=NERIST Block B (Pare Hostel)
set ROOM_INFO=Room 29

if "%CHOICE%"=="1" (
    set STATION_ID=block_b
    set STATION_NAME=NERIST Block B (Pare Hostel)
    set /p ROOM_INFO="Enter Room/Custodian details (Default: Room 29): "
    if "!ROOM_INFO!"=="" set ROOM_INFO=Room 29
)
if "%CHOICE%"=="2" (
    set STATION_ID=block_c
    set STATION_NAME=NERIST Block C (Dibang Hostel)
    set /p ROOM_INFO="Enter Room/Custodian details (e.g. Room 104, Ground Floor): "
    if "!ROOM_INFO!"=="" set ROOM_INFO=Block C Ground Floor
)
if "%CHOICE%"=="3" (
    set STATION_ID=block_a
    set STATION_NAME=NERIST Block A (Tirap Hostel)
    set /p ROOM_INFO="Enter Room/Custodian details: "
)
if "%CHOICE%"=="4" (
    set STATION_ID=block_d
    set STATION_NAME=NERIST Block D (Panyor Hostel)
    set /p ROOM_INFO="Enter Room/Custodian details: "
)
if "%CHOICE%"=="5" (
    set STATION_ID=block_e
    set STATION_NAME=NERIST Block E (Kameng Hostel)
    set /p ROOM_INFO="Enter Room/Custodian details: "
)
if "%CHOICE%"=="6" (
    set STATION_ID=block_f
    set STATION_NAME=NERIST Block F (Lohit Hostel)
    set /p ROOM_INFO="Enter Room/Custodian details: "
)
if "%CHOICE%"=="7" (
    set STATION_ID=block_g
    set STATION_NAME=NERIST Block G (Siang Hostel)
    set /p ROOM_INFO="Enter Room/Custodian details: "
)
if "%CHOICE%"=="8" (
    set STATION_ID=block_h
    set STATION_NAME=NERIST Block H (Kurung-Paniu Hostel)
    set /p ROOM_INFO="Enter Room/Custodian details: "
)
if "%CHOICE%"=="9" (
    set STATION_ID=girls_hostel
    set STATION_NAME=NERIST Girls Hostel (Subansiri)
    set /p ROOM_INFO="Enter Room/Custodian details: "
)
if "%CHOICE%"=="10" (
    set /p STATION_ID="Enter unique station ID (e.g. block_b_room29): "
    set /p STATION_NAME="Enter station display name (e.g. NERIST Library Counter): "
    set /p ROOM_INFO="Enter Room/Location: "
)

echo.
echo -------------------------------------------------------------------------------
echo Selected: !STATION_NAME! (!ROOM_INFO!)
echo Station ID: !STATION_ID!
echo -------------------------------------------------------------------------------
echo.

echo Detecting installed Windows printers...
powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name" > temp_printers.txt
echo.
echo Found Printers on this machine:
type temp_printers.txt
del temp_printers.txt 2>nul
echo.
echo Leave blank to use the Windows Default Printer.
set /p PRINTER_CHOICE="Enter Printer Name exactly as shown above (or press Enter for Default): "

echo.
echo Generating station_config.json...

(
echo {
echo   "station_id": "!STATION_ID!",
echo   "station_name": "!STATION_NAME!",
echo   "room_info": "!ROOM_INFO!",
echo   "printer_name": "!PRINTER_CHOICE!",
echo   "auto_duplex": false,
echo   "poll_interval_seconds": 2
echo }
) > station_config.json

echo [SUCCESS] station_config.json created successfully!
echo.

echo Checking Python environment...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Python is not found in PATH!
    echo Please install Python 3.10+ from python.org or ensure it is added to PATH.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo Installing / Verifying requirements...
pip install -r requirements.txt --quiet >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Python dependencies verified.
) else (
    echo [INFO] Dependency check completed.
)

echo.
echo ===============================================================================
echo                       SETUP COMPLETE! READY TO LAUNCH
echo ===============================================================================
echo  Your station will report live heartbeat to NERIST PrintHub immediately.
echo  Students selecting "!STATION_NAME!" will see your station as 🟢 ONLINE.
echo ===============================================================================
echo.

set /p LAUNCH="Launch print daemon now? (Y/N, Default: Y): "
if "%LAUNCH%"=="" set LAUNCH=Y
if /i "%LAUNCH%"=="Y" (
    echo.
    echo Starting PrintKurox Daemon for !STATION_NAME!...
    python -u printer_daemon.py
)

echo.
echo Setup finished. You can run start_daemon.bat anytime to start printing.
pause
