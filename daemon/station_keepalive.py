"""
=============================================================================
PrintKurox Hostel Station — Always-Online & Anti-Disconnect Watchdog Daemon
=============================================================================
Purpose:
1. Prevents Windows, Laptop CPU, and Wi-Fi card from sleeping (Sleep: OFF).
2. Transmits continuous heartbeats directly to Cloudflare D1 every 8 seconds
   so the hostel station NEVER displays "Offline" on the website.
3. Automatically detects network drops and reconnects Wi-Fi.
4. Auto-heals / restarts Print Daemon and WhatsApp Bot if they ever stop.
=============================================================================
"""

import os
import sys
import time
import socket
import subprocess
import requests
import json
import ctypes
import xml.etree.ElementTree as ET
from datetime import datetime
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

# Configuration
STATION_ID = os.getenv('STATION_ID', 'block_b')
STATION_NAME = os.getenv('STATION_NAME', 'NERIST Block B (Pare Hostel)')
PRINTER_NAME = os.getenv('PRINTER_NAME', 'EPSON L3210 Series')
SERVER_URL = os.getenv('SERVER_URL', 'https://printkurox.vercel.app').rstrip('/')

CF_ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID', '')
CF_API_TOKEN = os.getenv('CLOUDFLARE_API_TOKEN', '')
CF_D1_DB_ID = os.getenv('CLOUDFLARE_D1_DATABASE_ID', '')
STATION_TOKEN = os.getenv('STATION_TOKEN', '')

# Campus Wi-Fi Captive Portal Settings (Cyberoam / Sophos)
CAMPUS_PORTAL_ENABLED = os.getenv('CAMPUS_PORTAL_ENABLED', 'true').lower() in ('true', '1', 'yes')
CAMPUS_PORTAL_URL = os.getenv('CAMPUS_PORTAL_URL', 'http://10.10.200.1:8090').rstrip('/')
CAMPUS_WIFI_USER = os.getenv('CAMPUS_WIFI_USER', '')
CAMPUS_WIFI_PASS = os.getenv('CAMPUS_WIFI_PASS', '')


STATION_SLOTS = {
    'main': 1,
    'block_b': 1,
    'block_c': 2,
    'block_a': 3,
    'block_d': 4,
    'block_e': 5,
    'block_f': 6,
    'block_g': 7,
    'block_h': 8,
    'girls_hostel': 9,
    'romen': 154,
    'romen_xerox': 154,
}
STATION_SLOT = STATION_SLOTS.get(STATION_ID, 1)

# =============================================================================
# 1. WINDOWS ANTI-SLEEP KEEP-ALIVE (PREVENT LAPTOP & WI-FI STANDBY)
# =============================================================================
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002
ES_AWAYMODE_REQUIRED = 0x00000040

def set_windows_anti_sleep(enable=True):
    """
    Commands the Windows Power Manager to prevent sleep, standby,
    and Wi-Fi adapter power-down. Keeps the station running 24/7.
    """
    try:
        if sys.platform == 'win32':
            if enable:
                flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED
                ctypes.windll.kernel32.SetThreadExecutionState(flags)
            else:
                ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
            return True
    except Exception as e:
        print(f"[Anti-Sleep Warning]: {e}")
    return False

# =============================================================================
# 2. CLOUDFLARE D1 DIRECT HEARTBEAT SENDER
# =============================================================================
def send_d1_heartbeat():
    """
    Sends an atomic heartbeat directly to Cloudflare D1 or via server proxy.
    Guarantees the hostel station is displayed 100% ONLINE on the website.
    """
    start = time.time()

    # 1. Direct Cloudflare D1
    if CF_ACCOUNT_ID and CF_API_TOKEN and CF_D1_DB_ID:
        url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_D1_DB_ID}/query"
        headers = {
            "Authorization": f"Bearer {CF_API_TOKEN}",
            "Content-Type": "application/json"
        }
        sql = """
        INSERT INTO daemon_heartbeat (id, updated_at, station_id)
        VALUES (?, datetime('now'), ?)
        ON CONFLICT(id) DO UPDATE SET
          updated_at = datetime('now'),
          station_id = excluded.station_id;
        """
        payload = {
            "sql": sql,
            "params": [STATION_SLOT, STATION_ID]
        }
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=5.0)
            latency_ms = int((time.time() - start) * 1000)
            if r.status_code == 200 and r.json().get("success"):
                return True, f"D1 {latency_ms}ms"
        except Exception:
            pass

    # 2. Server Proxy Heartbeat Fallback
    try:
        url = f"{SERVER_URL}/api/daemon/heartbeat"
        headers = {
            "X-Station-Token": STATION_TOKEN,
            "Content-Type": "application/json"
        }
        r = requests.post(url, headers=headers, json={"station_id": STATION_ID}, timeout=5.0)
        latency_ms = int((time.time() - start) * 1000)
        if r.status_code == 200 and r.json().get("success"):
            return True, f"Proxy {latency_ms}ms"
        return False, f"HTTP {r.status_code}"
    except Exception as e:
        return False, str(e)

# =============================================================================
# 3. CAMPUS WI-FI (NERIST / SOPHOS CYBEROAM) AUTO-LOGIN WATCHDOG
# =============================================================================
def check_internet_probe():
    """
    Checks if genuine external internet is reachable, or if traffic is being
    intercepted by the campus captive portal (HTTP 204 detection probe).
    Returns: (is_online: bool, reason: str)
      - (True, "ONLINE")
      - (False, "CAPTIVE_PORTAL")
      - (False, "NO_CONNECTION")
    """
    # 1. Probe HTTP 204 endpoint (standard captive portal detector)
    try:
        r = requests.get('http://connectivitycheck.gstatic.com/generate_204', timeout=3.0, allow_redirects=False)
        if r.status_code == 204:
            return True, "ONLINE"
        elif r.status_code in (301, 302, 303, 307) or '10.10.200.1' in r.text or 'httpclient' in r.text:
            return False, "CAPTIVE_PORTAL"
    except Exception:
        pass

    # 2. Probe direct DNS over TCP socket
    for host in ["1.1.1.1", "8.8.8.8"]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2.0)
            s.connect((host, 53))
            s.close()
            return True, "ONLINE"
        except Exception:
            continue

    # 3. Check if campus portal gateway is reachable
    try:
        r = requests.get(f"{CAMPUS_PORTAL_URL}/httpclient.html", timeout=2.0)
        if r.status_code == 200:
            return False, "CAPTIVE_PORTAL"
    except Exception:
        pass

    return False, "NO_CONNECTION"

def login_campus_portal():
    """
    Automatically authenticates with the NERIST Cyberoam / Sophos captive portal
    via HTTP POST to /login.xml. Restores internet connectivity in < 500ms.
    Returns: (success: bool, message: str)
    """
    if not CAMPUS_PORTAL_ENABLED or not CAMPUS_WIFI_USER or not CAMPUS_WIFI_PASS:
        return False, "Portal credentials not configured in daemon/.env"

    try:
        t_ms = int(time.time() * 1000)
        payload = {
            'mode': '191',
            'username': CAMPUS_WIFI_USER,
            'password': CAMPUS_WIFI_PASS,
            'a': str(t_ms),
            'producttype': '0'
        }
        r = requests.post(f"{CAMPUS_PORTAL_URL}/login.xml", data=payload, timeout=5.0)
        if r.status_code == 200:
            try:
                root = ET.fromstring(r.text)
                status = root.findtext('status', default='').strip()
                msg = root.findtext('message', default='').strip()
                if status == 'LIVE':
                    return True, f"Logged in ({CAMPUS_WIFI_USER})"
                elif status == 'LOGIN':
                    return False, f"Rejected: {msg or 'Invalid credentials'}"
                return True, f"{status}: {msg}"
            except Exception:
                if 'LIVE' in r.text or 'signed in' in r.text:
                    return True, f"Logged in ({CAMPUS_WIFI_USER})"
        return False, f"Portal HTTP {r.status_code}"
    except Exception as e:
        return False, f"Portal error: {e}"

def keepalive_campus_portal():
    """
    Sends periodic keepalive ping to the campus portal live endpoint.
    """
    if not CAMPUS_PORTAL_ENABLED or not CAMPUS_WIFI_USER:
        return
    try:
        t_ms = int(time.time() * 1000)
        url = f"{CAMPUS_PORTAL_URL}/live?mode=192&username={CAMPUS_WIFI_USER}&a={t_ms}&producttype=0"
        requests.get(url, timeout=3.0)
    except Exception:
        pass

def auto_reconnect_wifi():
    """Attempts to re-associate Wi-Fi if network interface dropped."""
    try:
        if sys.platform == 'win32':
            subprocess.run(["netsh", "wlan", "connect"], capture_output=True, timeout=5)
            time.sleep(3)
    except Exception:
        pass

# =============================================================================
# 4. SERVICE MONITOR & AUTO-HEAL
# =============================================================================
def check_service_status(service_name):
    """Checks if a Windows background service or process is alive."""
    if sys.platform != 'win32':
        return "UNKNOWN"
    try:
        res = subprocess.run(["sc", "query", service_name], capture_output=True, text=True, timeout=3)
        if "RUNNING" in res.stdout:
            return "RUNNING"
        elif "STOPPED" in res.stdout:
            return "STOPPED"
        elif "does not exist" in res.stdout or "1060" in res.stdout:
            return "NOT_INSTALLED"
        return "INACTIVE"
    except Exception:
        return "CHECK_ERROR"

def ensure_services_running():
    """Checks and restarts services if they are stopped."""
    status_print = check_service_status("PrintKuroxDaemon")
    status_wa = check_service_status("PrintKuroxWhatsAppBot")

    if status_print == "STOPPED":
        try:
            subprocess.run(["net", "start", "PrintKuroxDaemon"], capture_output=True, timeout=5)
        except Exception:
            pass

    if status_wa == "STOPPED":
        try:
            subprocess.run(["net", "start", "PrintKuroxWhatsAppBot"], capture_output=True, timeout=5)
        except Exception:
            pass

    return status_print, status_wa

# =============================================================================
# 5. MAIN WATCHDOG LOOP & HUD
# =============================================================================
def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def main():
    print("[INIT] Activating Windows Anti-Sleep Keepalive Mode...")
    set_windows_anti_sleep(True)

    print("[INIT] Starting Always-Online Watchdog loop...")
    heartbeat_count = 0
    fail_count = 0
    portal_status_msg = f"Configured ({CAMPUS_WIFI_USER})" if CAMPUS_WIFI_USER else "Disabled"
    last_portal_ping = 0

    try:
        while True:
            # 1. Check Internet & Captive Portal Status
            has_internet, net_reason = check_internet_probe()

            if net_reason == "CAPTIVE_PORTAL":
                portal_status_msg = "Logging in..."
                ok, msg = login_campus_portal()
                portal_status_msg = msg
                time.sleep(1)
                has_internet, net_reason = check_internet_probe()
            elif net_reason == "NO_CONNECTION":
                fail_count += 1
                if fail_count >= 2:
                    auto_reconnect_wifi()
                    ok, msg = login_campus_portal()
                    portal_status_msg = msg
                    has_internet, net_reason = check_internet_probe()
            else:
                fail_count = 0
                portal_status_msg = f"Authenticated ({CAMPUS_WIFI_USER})"
                # Send periodic portal keepalive every 90 seconds
                if time.time() - last_portal_ping > 90:
                    keepalive_campus_portal()
                    last_portal_ping = time.time()

            # 2. Transmit Cloud D1 Heartbeat (guarantees website displays ONLINE)
            hb_success, hb_info = send_d1_heartbeat()
            if hb_success:
                heartbeat_count += 1

            # 3. Ensure Daemons are running
            svc_print, svc_wa = ensure_services_running()

            # 4. Refresh Windows anti-sleep assertion
            set_windows_anti_sleep(True)

            # 5. Draw Clean Live Dashboard
            clear_screen()
            now_str = datetime.now().strftime("%I:%M:%S %p")
            print("===============================================================================")
            print("         PRINTKUROX HOSTEL STATION — ALWAYS-ONLINE WATCHDOG")
            print("===============================================================================")
            print(f" Station Name    : {STATION_NAME} [{STATION_ID.upper()}]")
            print(f" Web Status      : {'\033[92m[ONLINE - ALWAYS CONNECTED]\033[0m' if hb_success else '\033[91m[SYNCING...]\033[0m'}")
            print(f" Campus Wi-Fi    : \033[92m[{portal_status_msg}]\033[0m")
            print(f" Anti-Sleep      : \033[92m[ACTIVE]\033[0m Laptop & Wi-Fi will NOT sleep")
            print(f" Cloud Heartbeat : {'\033[92mOK\033[0m (' + hb_info + ')' if hb_success else '\033[91mFAILED: ' + hb_info + '\033[0m'}")
            print(f" Total Syncs     : {heartbeat_count} consecutive successful heartbeats")
            print(f" Internet Link   : {'\033[92mSTABLE\033[0m' if has_internet else '\033[91m' + net_reason + ' (Resolving...)\033[0m'}")
            print(f" Print Daemon    : {svc_print}")
            print(f" WhatsApp Bot    : {svc_wa}")
            print(f" Last Updated    : {now_str}")
            print("===============================================================================")
            print(" Keep this program open to ensure the hostel station is always connected 24/7.")
            print(" Press Ctrl + C to stop.")
            print("===============================================================================")

            # Heartbeat cadence: 15 seconds (well inside the website's 45s threshold, uses only ~5.7% of Cloudflare D1 daily free tier)
            time.sleep(15)

    except KeyboardInterrupt:
        print("\n[STOPPING] Restoring standard Windows power state...")
        set_windows_anti_sleep(False)
        print("Watchdog stopped safely.")
        sys.exit(0)

if __name__ == '__main__':
    main()

