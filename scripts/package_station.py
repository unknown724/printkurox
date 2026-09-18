#!/usr/bin/env python3
"""
PrintNERIST Hostel Station Deployment Packager
Generates self-contained, pre-configured 1-click deployment ZIP archives
for each NERIST hostel print station custodian.
"""

import os
import sys
import json
import shutil
import zipfile
import argparse

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAEMON_DIR = os.path.join(BASE_DIR, 'daemon')
OUTPUT_BASE = os.path.join(BASE_DIR, 'dist_stations')

# Canonical Registry of NERIST Stations
STATIONS = {
    'block_b': {
        'code': 'Block_B',
        'river': 'Pare',
        'name': 'NERIST Block B (Pare Hostel)',
        'room': 'Room 29, 1st Floor',
        'pin': 'Kurox725#29',
        'operator': 'Devananda / Custodian',
    },
    'block_c': {
        'code': 'Block_C',
        'river': 'Dibang',
        'name': 'NERIST Block C (Dibang Hostel)',
        'room': 'Ground Floor Common Area',
        'pin': 'Dibang725#',
        'operator': 'Block C Custodian',
    },
    'block_a': {
        'code': 'Block_A',
        'river': 'Tirap',
        'name': 'NERIST Block A (Tirap Hostel)',
        'room': 'Block A Common Room',
        'pin': 'Tirap725#',
        'operator': 'Block A Custodian',
    },
    'block_d': {
        'code': 'Block_D',
        'river': 'Panyor',
        'name': 'NERIST Block D (Panyor Hostel)',
        'room': 'Block D Common Room',
        'pin': 'Panyor725#',
        'operator': 'Block D Custodian',
    },
    'block_e': {
        'code': 'Block_E',
        'river': 'Kameng',
        'name': 'NERIST Block E (Kameng Hostel)',
        'room': 'Block E Common Room',
        'pin': 'Kameng725#',
        'operator': 'Block E Custodian',
    },
    'block_f': {
        'code': 'Block_F',
        'river': 'Lohit',
        'name': 'NERIST Block F (Lohit Hostel)',
        'room': 'Block F Common Room',
        'pin': 'Lohit725#',
        'operator': 'Block F Custodian',
    },
    'block_g': {
        'code': 'Block_G',
        'river': 'Siang',
        'name': 'NERIST Block G (Siang Hostel)',
        'room': 'Block G Common Room',
        'pin': 'Siang725#',
        'operator': 'Block G Custodian',
    },
    'block_h': {
        'code': 'Block_H',
        'river': 'Kurung',
        'name': 'NERIST Block H (Kurung-Paniu Hostel)',
        'room': 'Block H Common Room',
        'pin': 'Kurung725#',
        'operator': 'Block H Custodian',
    },
    'girls_hostel': {
        'code': 'Girls_Hostel',
        'river': 'Subansiri',
        'name': 'NERIST Girls Hostel (Subansiri)',
        'room': 'Girls Hostel Recreation Room',
        'pin': 'Subansiri725#',
        'operator': 'Girls Hostel Custodian',
    },
    'romen_xerox': {
        'code': 'Romen_Xerox',
        'river': 'Nirjuli',
        'name': 'Romen Xerox & Cyber Cafe',
        'room': 'NERIST Main Gate Market',
        'pin': 'Romen725#',
        'operator': 'Romen',
    },
}

def create_enable_autostart_bat(station_id, info, station_token):
    service_name = f"PrintNERIST_{info['code']}"
    return f"""@echo off
setlocal EnableDelayedExpansion
title PrintNERIST -- {info['name']} Auto-Start Setup
color 0B

cd /d "%~dp0"

echo ===============================================================================
echo                PRINTNERIST HOSTEL STATION AUTO-START SETUP
echo             Station: {info['name']}
echo             Location: {info['room']}
echo ===============================================================================
echo.

:: Check for Administrative Privileges
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [IMPORTANT] Requesting Administrator Privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [1/4] Detecting connected Windows Printers...
powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name" > temp_printers.txt
echo.
echo Found Printers on this machine:
type temp_printers.txt
del temp_printers.txt 2>nul
echo.
echo Leave blank to use the Windows Default Printer.
set /p PRINTER_CHOICE="Enter Printer Name exactly as shown above (or press Enter for Default): "

echo.
echo [2/4] Saving station_config.json...
(
echo {{
echo   "station_id": "{station_id}",
echo   "station_name": "{info['name']}",
echo   "station_token": "{station_token}",
echo   "server_url": "https://printnerist.shop",
echo   "room_info": "{info['room']}",
echo   "printer_name": "!PRINTER_CHOICE!",
echo   "auto_duplex": false,
echo   "poll_interval_seconds": 2
echo }}
) > station_config.json
echo [SUCCESS] station_config.json updated!

echo.
echo [3/4] Verifying Python runtime...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python 3.10+ is required. Please install Python from python.org
    echo and ensure "Add python.exe to PATH" is checked during installation.
    pause
    exit /b 1
)

pip install -r daemon\\requirements.txt --quiet >nul 2>&1
echo [OK] Dependencies verified.

echo.
echo [4/4] Installing Windows Auto-Start Task ({service_name})...

:: Register Windows Scheduled Task that starts on system boot and logon
set TASK_NAME={service_name}
set SCRIPT_PATH=%~dp0daemon\\printer_daemon.py

schtasks /delete /tn "!TASK_NAME!" /f >nul 2>&1

schtasks /create /tn "!TASK_NAME!" /tr "pythonw.exe \\"!SCRIPT_PATH!\\"" /sc onlogon /rl highest /f >nul 2>&1
if %ERRORLEVEL% EQU 0 goto :TASK_OK

echo [INFO] Task Scheduler registration skipped. Adding to Startup folder...
set STARTUP_VBS=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\{service_name}.vbs
echo Set WshShell = CreateObject("WScript.Shell") > "!STARTUP_VBS!"
echo WshShell.Run "pythonw.exe \"\"!SCRIPT_PATH!\"\"", 0, False >> "!STARTUP_VBS!"
echo [SUCCESS] Added to Windows Startup folder.

:TASK_OK
echo [SUCCESS] Windows Auto-Start registered successfully!
echo The print daemon will run silently in the background whenever Windows starts.

echo.
echo Starting PrintNERIST Daemon for {info['name']} now...
start "" pythonw.exe "%~dp0daemon\\printer_daemon.py"

echo.
echo ===============================================================================
echo                        STATION SETUP COMPLETE!
echo ===============================================================================
echo  Your station is now [ONLINE] on https://printnerist.shop
echo.
echo  Hostel Students Link: https://printnerist.shop/?station={station_id}
echo  Co-Admin Queue Link:  https://printnerist.shop/station/{station_id}
echo  Station Passcode:     {info['pin']}
echo ===============================================================================
echo.
pause
"""

def create_start_printer_bat(station_id, info):
    return f"""@echo off
title PrintNERIST -- {info['name']} Console
color 0A
cd /d "%~dp0"

echo ===============================================================================
echo                PRINTNERIST HOSTEL STATION RUNNER (CONSOLE)
echo             Station: {info['name']}
echo ===============================================================================
echo.

python -u daemon\\printer_daemon.py
pause
"""

def create_stop_printer_bat(station_id, info):
    return f"""@echo off
title Stopping PrintNERIST -- {info['name']}
cd /d "%~dp0"

echo Stopping any running PrintNERIST daemon instances...
taskkill /f /im pythonw.exe /fi "WINDOWTITLE eq PrintNERIST*" >nul 2>&1
taskkill /f /im SumatraPDF-3.5.2-64.exe >nul 2>&1
echo [OK] Stopped.
timeout /t 2 >nul
"""

def create_operator_guide(station_id, info):
    return f"""# PrintNERIST Hostel Station Operator Guide
## Station: {info['name']} ({info['river']})

Welcome to the **PrintNERIST Autonomous Campus Network**!
Follow these simple steps to start receiving and printing student documents directly in your room.

---

### 1. Requirements
- A Windows Laptop or PC with Python 3.10+ installed.
- Your printer (Epson, Canon, HP, Brother, etc.) connected via USB or Wi-Fi.
- Internet connection (Wi-Fi or Hotspot).

---

### 2. Quick Setup (Under 1 Minute)
1. Turn on your printer and connect it to your laptop.
2. Right-click **`ENABLE_AUTO_START.bat`** and choose **"Run as administrator"**.
3. Select your printer when prompted (or press Enter to use the Windows default printer).
4. That's it! Your laptop will now automatically receive, download, and print jobs whenever students send them!

---

### 3. Your Links & Passcode
- **Student Print Link:** `https://printnerist.shop/?station={station_id}`
  *(Students who scan your hostel room QR code or visit this link will have their prints routed directly to your room!)*

- **Co-Admin Station Console:** `https://printnerist.shop/station/{station_id}`
  - **Your Passcode:** `{info['pin']}`
  - **Features:**
    - Live Queue & Status
    - **1-Click Reprint:** If paper jams or ink was low, click "Reprint" to instantly reprint any job.
    - View today's total jobs and pages printed.

---

### 4. Need Help?
- Campus Platform Admin (Devananda): +91 98630 13886
- Console test runner: Double-click `START_PRINTER.bat` to see real-time print logs in a command window.
"""

def package_station(station_id):
    if station_id not in STATIONS:
        print(f"[ERROR] Unknown station ID: '{station_id}'")
        print(f"Available stations: {', '.join(STATIONS.keys())}")
        return False

    info = STATIONS[station_id]
    pkg_name = f"PrintNERIST_{info['code']}_{info['river']}_Setup"
    pkg_dir = os.path.join(OUTPUT_BASE, pkg_name)
    zip_path = os.path.join(OUTPUT_BASE, f"{pkg_name}.zip")

    print(f"\n=======================================================")
    print(f" Packaging Station: [{station_id}] {info['name']}")
    print(f" Target Folder: {pkg_dir}")
    print(f"=======================================================")

    # Clean existing package dir
    if os.path.exists(pkg_dir):
        shutil.rmtree(pkg_dir)
    os.makedirs(pkg_dir, exist_ok=True)

    # 1. Compute cryptographically deterministic station secret token
    import hmac, hashlib
    master_key = os.getenv('ADMIN_SECRET_KEY') or 'Kurox725#29'
    token_hash = hmac.new(master_key.encode(), f'station_daemon:{station_id}'.encode(), hashlib.sha256).hexdigest()
    station_token = f"kurox_st_{station_id}_{token_hash}"

    # 1. Write station_config.json
    config_data = {
        "station_id": station_id,
        "station_name": info['name'],
        "station_token": station_token,
        "server_url": "https://printnerist.shop",
        "room_info": info['room'],
        "printer_name": "",
        "auto_duplex": False,
        "poll_interval_seconds": 2
    }
    with open(os.path.join(pkg_dir, 'station_config.json'), 'w', encoding='utf-8') as f:
        json.dump(config_data, f, indent=2)
    print(" [OK] Generated station_config.json (Zero Cloud Secrets)")

    # 2. Write Batch Scripts
    with open(os.path.join(pkg_dir, 'ENABLE_AUTO_START.bat'), 'w', encoding='utf-8') as f:
        f.write(create_enable_autostart_bat(station_id, info, station_token))
    print(" [OK] Generated ENABLE_AUTO_START.bat")

    with open(os.path.join(pkg_dir, 'START_PRINTER.bat'), 'w', encoding='utf-8') as f:
        f.write(create_start_printer_bat(station_id, info))
    print(" [OK] Generated START_PRINTER.bat")

    with open(os.path.join(pkg_dir, 'STOP_PRINTER.bat'), 'w', encoding='utf-8') as f:
        f.write(create_stop_printer_bat(station_id, info))
    print(" [OK] Generated STOP_PRINTER.bat")

    # 3. Write Operator Guide
    with open(os.path.join(pkg_dir, 'OPERATOR_GUIDE.md'), 'w', encoding='utf-8') as f:
        f.write(create_operator_guide(station_id, info))
    print(" [OK] Generated OPERATOR_GUIDE.md")

    # 4. Copy Daemon files
    daemon_dest = os.path.join(pkg_dir, 'daemon')
    os.makedirs(daemon_dest, exist_ok=True)

    shutil.copy(os.path.join(DAEMON_DIR, 'printer_daemon.py'), os.path.join(daemon_dest, 'printer_daemon.py'))
    shutil.copy(os.path.join(DAEMON_DIR, 'requirements.txt'), os.path.join(daemon_dest, 'requirements.txt'))

    # Copy sumatra engine
    sumatra_src = os.path.join(DAEMON_DIR, 'sumatra')
    sumatra_dest = os.path.join(daemon_dest, 'sumatra')
    if os.path.exists(sumatra_src):
        shutil.copytree(sumatra_src, sumatra_dest)
        print(" [OK] Bundled SumatraPDF silent engine")

    # 5. Create ZIP Archive
    if os.path.exists(zip_path):
        os.remove(zip_path)

    print(" Compressing into ZIP archive...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(pkg_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, pkg_dir)
                zipf.write(full_path, rel_path)

    zip_size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    print(f" [SUCCESS] Created: {zip_path} ({zip_size_mb:.2f} MB)")
    return True

def main():
    parser = argparse.ArgumentParser(description="Package PrintNERIST Hostel Station Setup Archives")
    parser.add_argument('--station', type=str, help="Specific station ID (e.g. block_c, block_b, block_a)")
    parser.add_argument('--all', action='store_true', help="Package all registered campus stations")
    args = parser.parse_args()

    os.makedirs(OUTPUT_BASE, exist_ok=True)

    if args.all:
        for s_id in STATIONS:
            package_station(s_id)
        print("\nAll hostel station packages created successfully in dist_stations/")
    elif args.station:
        package_station(args.station)
    else:
        print("Please specify a station (e.g. --station block_c) or use --all")
        print(f"Available stations: {', '.join(STATIONS.keys())}")

if __name__ == '__main__':
    main()
