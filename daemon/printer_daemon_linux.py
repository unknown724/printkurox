#!/usr/bin/env python3
"""
PrintKurox Embedded Hardware Print Daemon (Linux / Raspberry Pi 3B+ Edition)
===========================================================================
Features:
- Direct Cloudflare D1 + Direct Cloudflare R2 SigV4 (0 Worker quota usage in normal mode)
- Automatic HTTP fallback to https://printkurox.pages.dev if D1/R2 fail
- Native CUPS USB integration + EPSON L3210/L3250, HP, Canon, Brother
- Raspberry Pi live hardware telemetry (CPU temp, undervoltage, battery/UPS, disk, RAM, swap, Wi-Fi, uptime)
- Automatic USB storage safety guard (temp purge + 30-day archive cap + <8 GB emergency prune)
"""

import os
import sys
import math
import time
import json
import hmac
import shutil
import hashlib
import logging
import requests
from requests.adapters import HTTPAdapter
import subprocess
import threading
import re
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Base Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'station_config.json')
DEVICE_IDENTITY_PATH = os.path.join(BASE_DIR, 'device_identity.json')
TEMP_DIR = os.path.join(BASE_DIR, 'temp_prints')
ACTIVE_SPOOL_DIR = TEMP_DIR
ARCHIVE_DIR = os.path.join(BASE_DIR, 'printed_archive')

import showcase_state as ss

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(ARCHIVE_DIR, exist_ok=True)

# Lightweight .env loader (ensures systemd / standalone runs pick up .env keys)
_env_path = os.path.join(BASE_DIR, '.env')
if os.path.exists(_env_path):
    try:
        with open(_env_path, 'r', encoding='utf-8') as _ef:
            for _line in _ef:
                _s = _line.strip()
                if _s and not _s.startswith('#') and '=' in _s:
                    _k, _v = _s.split('=', 1)
                    os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.info
warn = logging.warning
error = logging.error

# Load Effective Station Configuration (base station_config.json + optional showcase_override.json)
station_data = ss.load_effective_station()
IS_SHOWCASE_MODE = bool(station_data.get('is_showcase'))
log(f"Loaded station config: {station_data.get('station_name')} [{station_data.get('station_id')}]"
    + (" (SHOWCASE OVERRIDE)" if IS_SHOWCASE_MODE else ""))

STATION_ID = station_data.get('station_id') if IS_SHOWCASE_MODE else os.getenv('STATION_ID', station_data.get('station_id', 'block_b'))
STATION_TOKEN = (station_data.get('station_token') or os.getenv('STATION_TOKEN', '')) if IS_SHOWCASE_MODE else os.getenv('STATION_TOKEN', station_data.get('station_token', ''))
SERVER_URL = os.getenv('SERVER_URL', station_data.get('server_url', 'https://printkurox.pages.dev')).rstrip('/')
CONFIGURED_PRINTER = (station_data.get('printer_name') or '') if IS_SHOWCASE_MODE else os.getenv('PRINTER_NAME', station_data.get('printer_name', ''))
AUTO_DUPLEX = os.getenv('AUTO_DUPLEX', str(station_data.get('auto_duplex', 'false'))).lower() == 'true'
POLL_INTERVAL_SECONDS = float(os.getenv('POLL_INTERVAL_SECONDS', str(station_data.get('poll_interval_seconds', 1.5))))
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv('HEARTBEAT_INTERVAL_SECONDS', '30'))
RETENTION_DAYS = int(os.getenv('ARCHIVE_RETENTION_DAYS', '30'))
MIN_FREE_GB_GUARD = float(os.getenv('MIN_FREE_GB_GUARD', '8.0'))

CF_ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID', '').strip()
CF_API_TOKEN = os.getenv('CLOUDFLARE_API_TOKEN', '').strip()
CF_D1_DB_ID = os.getenv('CLOUDFLARE_D1_DATABASE_ID', '').strip()

R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', '').strip()
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', '').strip()
R2_ENDPOINT = os.getenv('R2_ENDPOINT', '').strip().rstrip('/')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'kiosk-uploads').strip()

_pool_adapter = HTTPAdapter(pool_connections=6, pool_maxsize=6)

_session = requests.Session()
_session.mount('https://', _pool_adapter)
_session.mount('http://', _pool_adapter)
_session.headers.update({
    "X-Station-Id": STATION_ID,
    "X-Station-Token": STATION_TOKEN,
    "User-Agent": f"PrintKurox-Linux-Daemon/3.1 ({STATION_ID})"
})

_d1_session = requests.Session()
_d1_session.mount('https://', _pool_adapter)
if CF_API_TOKEN:
    _d1_session.headers.update({
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": f"PrintKurox-Linux-Daemon/3.1 ({STATION_ID})"
    })

_r2_session = requests.Session()
_r2_session.mount('https://', _pool_adapter)
_r2_session.headers.update({
    "User-Agent": f"PrintKurox-R2-Client/3.1 ({STATION_ID})"
})


_d1_backoff_until = 0.0
_wake_event = threading.Event()


def trigger_immediate_poll():
    """Wakes the main poll loop immediately (e.g., from local WhatsApp bot)."""
    _wake_event.set()


class _WakeRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path.startswith('/poll-now'):
            trigger_immediate_poll()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/health') or self.path.startswith('/poll-now'):
            if self.path.startswith('/poll-now'):
                trigger_immediate_poll()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        return


def start_local_wake_server():
    """Listens on 127.0.0.1:7250 so local WhatsApp bot wakes the Pi printer in 0ms."""
    try:
        ThreadingHTTPServer.allow_reuse_address = True
        srv = ThreadingHTTPServer(('127.0.0.1', 7250), _WakeRequestHandler)
        srv.daemon_threads = True
        log("Local wake listener ready on http://127.0.0.1:7250/poll-now")
        srv.serve_forever()
    except OSError as e:
        warn(f"Local wake listener notice (port 7250): {e}")


def send_wa_admin_alert(alert_key, severity, title, body, cooldown_sec=1800):
    """Sends a non-blocking alert to local WhatsApp bot bridge (127.0.0.1:7261 -> ADMIN_PHONE 9863013886)."""
    def _post():
        try:
            requests.post(
                "http://127.0.0.1:7261/internal/admin-alert",
                headers={"X-Station-Token": STATION_TOKEN, "Content-Type": "application/json"},
                json={
                    "alertKey": alert_key,
                    "severity": severity,
                    "title": title,
                    "body": body,
                    "cooldownMs": int(cooldown_sec * 1000),
                },
                timeout=(1.0, 3.0),
            )
        except Exception:
            pass
    threading.Thread(target=_post, daemon=True).start()


def d1_query(sql, params=None, timeout=6.0):
    """Execute a Cloudflare D1 REST query directly (0 Worker usage) with 429 Retry-After backoff."""
    global _d1_backoff_until
    if not (CF_ACCOUNT_ID and CF_API_TOKEN and CF_D1_DB_ID):
        return None
    if time.monotonic() < _d1_backoff_until:
        return None

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_D1_DB_ID}/query"
    r = _d1_session.post(url, json={"sql": sql, "params": params or []}, timeout=timeout)
    if r.status_code == 200:
        data = r.json()
        if data.get("success"):
            return data.get("result", [])
    elif r.status_code == 429 or 502 <= r.status_code <= 504:
        try:
            retry_after = float(r.headers.get("Retry-After", "0") or 0)
        except Exception:
            retry_after = 0.0
        wait_s = max(2.0, min(30.0, retry_after if retry_after > 0 else 5.0))
        _d1_backoff_until = time.monotonic() + wait_s
        warn(f"Cloudflare D1 HTTP {r.status_code}; pausing direct D1 queries for {wait_s:.1f}s")
        if r.status_code == 429:
            send_wa_admin_alert(
                "cf_d1_429",
                "warn",
                "Cloudflare D1 Rate Limit (429)",
                f"Station `{STATION_ID}` hit Cloudflare D1 HTTP 429.\nAuto-paused D1 polling for *{wait_s:.1f}s* to protect quota.",
                cooldown_sec=900,
            )
    return None


def ensure_station_paired():
    """Auto-pairing engine for pre-flashed controller boxes."""
    global STATION_ID, STATION_TOKEN, SERVER_URL, station_data, _session
    if STATION_TOKEN and STATION_TOKEN != 'YOUR_STATION_SECRET_TOKEN':
        return

    serial_key = None
    if os.path.exists(DEVICE_IDENTITY_PATH):
        try:
            with open(DEVICE_IDENTITY_PATH, 'r', encoding='utf-8') as f:
                ident = json.load(f)
                serial_key = ident.get('serial_key')
                if ident.get('cloud_url'):
                    SERVER_URL = ident.get('cloud_url').rstrip('/')
        except Exception as e:
            warn(f"Failed to read device_identity.json: {e}")

    serial_key = os.getenv('SERIAL_KEY', serial_key or station_data.get('serial_key'))
    if not serial_key:
        warn("No STATION_TOKEN and no SERIAL_KEY found. Proceeding with fallback station ID.")
        return

    log("=" * 60)
    log(f"  PrintKurox Controller Box (Serial: {serial_key})")
    log(f"  Waiting for operator activation at: {SERVER_URL}/setup")
    log("=" * 60)

    while True:
        try:
            pair_url = f"{SERVER_URL}/api/daemon/pair?serialKey={serial_key}"
            res = requests.get(pair_url, timeout=10)
            if res.status_code == 200:
                data = res.json()
                if data.get('paired'):
                    STATION_ID = data['station_id']
                    STATION_TOKEN = data['station_token']
                    station_name = data.get('station_name', 'Commercial Kiosk')
                    station_data.update({
                        'station_id': STATION_ID,
                        'station_name': station_name,
                        'station_token': STATION_TOKEN,
                        'server_url': SERVER_URL,
                        'serial_key': serial_key,
                        'paired_at': datetime.now(timezone.utc).isoformat()
                    })
                    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
                        json.dump(station_data, f, indent=2)
                    log(f"AUTO-PAIRED SUCCESSFULLY! Station: {station_name} [{STATION_ID}]")
                    _session.headers.update({
                        "X-Station-Id": STATION_ID,
                        "X-Station-Token": STATION_TOKEN,
                        "User-Agent": f"PrintKurox-Linux-Daemon/3.0 ({STATION_ID})"
                    })
                    break
        except Exception as e:
            warn(f"Network glitch while polling pairing state: {e}")
        time.sleep(5)


def get_available_cups_printers():
    """Queries CUPS for all available connected printers."""
    try:
        res = subprocess.run(['lpstat', '-e'], capture_output=True, text=True, timeout=5)
        return [p.strip() for p in res.stdout.strip().split('\n') if p.strip()]
    except Exception as e:
        warn(f"Failed to query lpstat -e: {e}")
        return []


def get_cups_queue_count():
    """Returns count of active CUPS spooler jobs."""
    try:
        res = subprocess.run(['lpstat', '-o'], capture_output=True, text=True, timeout=4)
        lines = [l.strip() for l in res.stdout.splitlines() if l.strip()]
        return len(lines)
    except Exception:
        return 0


_cached_printer_name = None
_cached_color_flags = {}
_cached_duplex_support = {}


def invalidate_printer_cache():
    global _cached_printer_name
    _cached_printer_name = None


def ensure_cups_printer_enabled(printer_name):
    """Re-enables a CUPS queue if it became paused/disabled after a USB unplug or power-off."""
    if not printer_name:
        return
    try:
        st = subprocess.run(['lpstat', '-p', printer_name], capture_output=True, text=True, timeout=3)
        out_lower = (st.stdout or '').lower()
        if 'disabled' in out_lower or 'paused' in out_lower or 'rejecting' in out_lower:
            subprocess.run(['sudo', 'cupsaccept', printer_name], capture_output=True, timeout=3)
            subprocess.run(['sudo', 'cupsenable', printer_name], capture_output=True, timeout=3)
            log(f"Auto-resumed paused CUPS queue: {printer_name}")
    except Exception:
        pass


def resolve_target_printer(force_refresh=False):
    """Resolves physically attached CUPS printer (auto-provisions new USB printers if needed)."""
    global _cached_printer_name
    if _cached_printer_name and not force_refresh:
        return _cached_printer_name

    available = get_available_cups_printers()
    queue_uris = ss.get_cups_queue_uris()
    physical = ss.list_physical_usb_printers()

    connected_queues = [
        p for p in available
        if ss.is_cups_queue_physically_present(p, queue_uris, physical)
    ]

    selected = None
    if CONFIGURED_PRINTER and connected_queues:
        clean_target = re.sub(r'[^a-zA-Z0-9]', '', CONFIGURED_PRINTER.lower())
        for p in connected_queues:
            clean_p = re.sub(r'[^a-zA-Z0-9]', '', p.lower())
            if clean_target in clean_p or clean_p in clean_target:
                selected = p
                break

    if not selected and connected_queues:
        selected = connected_queues[0]
        log(f"Auto-selected physically connected CUPS printer: {selected}")

    # If a USB printer is physically attached without a CUPS queue yet, auto-bind it now
    if not selected and physical:
        target_usb = physical[0]
        desired_name = CONFIGURED_PRINTER or target_usb['label']
        ok, new_q, msg = ss.provision_usb_printer(desired_name, target_usb['uri'], target_usb['label'])
        log(f"[USB Auto-Bind] {msg}")
        if ok and new_q:
            selected = new_q

    if not selected:
        warn("No physically connected CUPS/USB printer found! Check USB cable.")
        _cached_printer_name = None
        return None

    _cached_printer_name = selected
    ensure_cups_printer_enabled(selected)
    return selected


def get_printer_color_flags(printer_name, color_mode):
    """Detects whether the CUPS PPD uses Ink=MONO/COLOR (e.g. Epson ESC/P-R) or ColorModel=Grayscale/Color."""
    cache_key = printer_name or "__default__"
    if cache_key not in _cached_color_flags:
        bw_flags = ['-o', 'ColorModel=Grayscale']
        color_flags = ['-o', 'ColorModel=Color']
        has_duplex = False
        if printer_name:
            try:
                res = subprocess.run(
                    ['lpoptions', '-p', printer_name, '-l'],
                    capture_output=True, text=True, timeout=3
                )
                if res.returncode == 0 and res.stdout:
                    if re.search(r'^Ink(?:/|\s*:)', res.stdout, re.MULTILINE):
                        bw_flags = ['-o', 'Ink=MONO']
                        color_flags = ['-o', 'Ink=COLOR']
                    if re.search(r'^Duplex/.*DuplexNoTumble', res.stdout, re.MULTILINE):
                        has_duplex = True
            except Exception as e:
                warn(f"PPD option lookup note for {printer_name}: {e}")
        _cached_color_flags[cache_key] = (bw_flags, color_flags)
        _cached_duplex_support[cache_key] = has_duplex

    bw_flags, color_flags = _cached_color_flags[cache_key]
    is_bw = str(color_mode or 'bw').strip().lower() in ('bw', 'mono', 'monochrome', 'grayscale', 'black & white')
    return list(bw_flags if is_bw else color_flags)


def printer_supports_duplex(printer_name):
    """Checks cached PPD Duplex support (falls back to AUTO_DUPLEX config)."""
    cache_key = printer_name or "__default__"
    if cache_key not in _cached_duplex_support:
        get_printer_color_flags(printer_name, 'bw')
    return AUTO_DUPLEX or _cached_duplex_support.get(cache_key, False)


def inspect_pdf_is_landscape(file_path):
    """Inspects first PDF page geometry (width > height accounting for /Rotate) cleanly."""
    if not str(file_path).lower().endswith('.pdf'):
        try:
            with open(file_path, 'rb') as f:
                if f.read(4) != b'%PDF':
                    return False
        except Exception:
            return False
    try:
        import pypdf
        reader = pypdf.PdfReader(file_path)
        if len(reader.pages) > 0:
            p0 = reader.pages[0]
            w = float(p0.mediabox.width)
            h = float(p0.mediabox.height)
            rot = int(p0.get('/Rotate', 0) or 0)
            if rot in (90, 270):
                w, h = h, w
            return w > h
    except Exception:
        pass

    # Pure-Python header fallback if pypdf is unavailable on Pi
    try:
        with open(file_path, 'rb') as f:
            blob = f.read(65536)
        mb = re.search(rb'/MediaBox\s*\[\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]', blob)
        if mb:
            x1, y1, x2, y2 = (float(mb.group(i)) for i in range(1, 5))
            w, h = abs(x2 - x1), abs(y2 - y1)
            rot_m = re.search(rb'/Rotate\s+(\d+)', blob)
            if rot_m and int(rot_m.group(1)) in (90, 270):
                w, h = h, w
            if w > 0 and h > 0:
                return w > h
    except Exception:
        pass
    return False


def get_linux_system_telemetry():
    """Collects Raspberry Pi CPU temp, undervoltage/battery, USB disk space, RAM, swap, load, Wi-Fi, and uptime."""
    telem = {
        "device_model": "Raspberry Pi / Linux SBC",
        "station_id": STATION_ID,
        "cpu_temp_c": None,
        "undervoltage_now": False,
        "undervoltage_occurred": False,
        "throttled_now": False,
        "battery_pct": None,
        "power_source": "5V Adapter",
        "disk_total_gb": None,
        "disk_used_gb": None,
        "disk_free_gb": None,
        "disk_used_pct": None,
        "ram_total_mb": None,
        "ram_used_mb": None,
        "ram_used_pct": None,
        "swap_total_mb": None,
        "swap_used_mb": None,
        "cpu_load_1m": None,
        "uptime_sec": None,
        "wifi_ssid": None,
        "wifi_signal_dbm": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        model_path = "/proc/device-tree/model"
        if os.path.exists(model_path):
            telem["device_model"] = open(model_path, "rb").read().replace(b"\x00", b"").decode("utf-8", "ignore").strip()
    except Exception:
        pass

    try:
        temp_path = "/sys/class/thermal/thermal_zone0/temp"
        if os.path.exists(temp_path):
            raw_mc = int(open(temp_path).read().strip())
            telem["cpu_temp_c"] = round(raw_mc / 1000.0, 1)
    except Exception:
        pass

    try:
        vc = subprocess.run(["vcgencmd", "get_throttled"], capture_output=True, text=True, timeout=2)
        if vc.returncode == 0 and "0x" in vc.stdout:
            val = int(vc.stdout.strip().split("=", 1)[-1], 16)
            telem["undervoltage_now"] = bool(val & 0x1)
            telem["throttled_now"] = bool(val & 0x4)
            telem["undervoltage_occurred"] = bool(val & 0x10000)
            telem["power_source"] = "Undervoltage Alert (<4.63V)" if telem["undervoltage_now"] else "5V Healthy"
    except Exception:
        pass

    try:
        ps_dir = "/sys/class/power_supply"
        if os.path.isdir(ps_dir):
            for name in os.listdir(ps_dir):
                cap_file = os.path.join(ps_dir, name, "capacity")
                if os.path.exists(cap_file):
                    telem["battery_pct"] = int(open(cap_file).read().strip())
                    st_file = os.path.join(ps_dir, name, "status")
                    st = open(st_file).read().strip() if os.path.exists(st_file) else ""
                    telem["power_source"] = f"Battery {telem['battery_pct']}% ({st})" if st else f"Battery {telem['battery_pct']}%"
                    break
    except Exception:
        pass

    try:
        du = shutil.disk_usage(BASE_DIR)
        telem["disk_total_gb"] = round(du.total / (1024 ** 3), 2)
        telem["disk_used_gb"] = round(du.used / (1024 ** 3), 2)
        telem["disk_free_gb"] = round(du.free / (1024 ** 3), 2)
        telem["disk_used_pct"] = round((du.used / du.total) * 100, 1) if du.total else 0
    except Exception:
        pass

    try:
        mem = {}
        with open("/proc/meminfo", "r") as mf:
            for line in mf:
                parts = line.split(":")
                if len(parts) == 2:
                    mem[parts[0].strip()] = int(parts[1].strip().split()[0])
        mt = mem.get("MemTotal", 0)
        ma = mem.get("MemAvailable", mem.get("MemFree", 0))
        st = mem.get("SwapTotal", 0)
        sf = mem.get("SwapFree", 0)
        if mt > 0:
            used_kb = max(0, mt - ma)
            telem["ram_total_mb"] = round(mt / 1024)
            telem["ram_used_mb"] = round(used_kb / 1024)
            telem["ram_used_pct"] = round((used_kb / mt) * 100, 1)
        telem["swap_total_mb"] = round(st / 1024)
        telem["swap_used_mb"] = round(max(0, st - sf) / 1024)
    except Exception:
        pass

    try:
        telem["cpu_load_1m"] = round(os.getloadavg()[0], 2)
        if os.path.exists("/proc/uptime"):
            telem["uptime_sec"] = int(float(open("/proc/uptime").read().split()[0]))
    except Exception:
        pass

    try:
        iw = subprocess.run(["iwgetid", "-r"], capture_output=True, text=True, timeout=2)
        if iw.returncode == 0 and iw.stdout.strip():
            telem["wifi_ssid"] = iw.stdout.strip()
        if os.path.exists("/proc/net/wireless"):
            for line in open("/proc/net/wireless"):
                if "wlan0" in line:
                    cols = line.split()
                    if len(cols) >= 4:
                        telem["wifi_signal_dbm"] = int(float(cols[3].rstrip(".")))
                    break
    except Exception:
        pass

    return telem


def cleanup_usb_storage():
    """Protects the Pi USB drive from ever filling up (temp cleanup + retention + <8GB emergency prune)."""
    now = time.time()
    deleted_files = 0
    try:
        # 1. Clean temp_prints > 2 hours
        cutoff_temp = now - (2 * 3600)
        for fn in os.listdir(TEMP_DIR):
            fp = os.path.join(TEMP_DIR, fn)
            if os.path.isfile(fp) and os.path.getmtime(fp) < cutoff_temp:
                os.remove(fp)
                deleted_files += 1

        # 2. Clean printed_archive > RETENTION_DAYS
        cutoff_arch = now - (RETENTION_DAYS * 86400)
        archived_files = []
        for root_dp, _, fns in os.walk(ARCHIVE_DIR):
            for fn in fns:
                fp = os.path.join(root_dp, fn)
                try:
                    mtime = os.path.getmtime(fp)
                    if mtime < cutoff_arch:
                        os.remove(fp)
                        deleted_files += 1
                    else:
                        archived_files.append((mtime, fp))
                except Exception:
                    pass

        # 3. Emergency free-space guard if free < MIN_FREE_GB_GUARD
        du = shutil.disk_usage(BASE_DIR)
        free_gb = du.free / (1024 ** 3)
        if free_gb < MIN_FREE_GB_GUARD and archived_files:
            archived_files.sort(key=lambda x: x[0])  # oldest first
            for _, fp in archived_files:
                if shutil.disk_usage(BASE_DIR).free / (1024 ** 3) >= (MIN_FREE_GB_GUARD + 2.0):
                    break
                try:
                    os.remove(fp)
                    deleted_files += 1
                except Exception:
                    pass
    except Exception as e:
        warn(f"USB storage cleanup notice: {e}")

    if deleted_files > 0:
        log(f"[USB Storage Guard] Cleaned {deleted_files} old/temp file(s).")


def storage_cleanup_worker():
    """Periodic disk guard every 30 minutes."""
    cleanup_usb_storage()
    while True:
        time.sleep(1800)
        cleanup_usb_storage()


def print_pdf_cups(printer_name, file_path, copies=1, color_mode='bw', is_duplex=False, page_range=None, orientation='auto'):
    """Prints a PDF file using native Linux CUPS lp command with true PPD color & orientation handling."""
    cmd = ['lp']
    if printer_name:
        cmd.extend(['-d', printer_name])
    if copies and int(copies) > 1:
        cmd.extend(['-n', str(copies)])
    cmd.extend(['-o', 'fit-to-page'])
    queue_uri = ss.get_cups_queue_uris().get(printer_name or '', '')
    if 'epson' in (printer_name or '').lower() or 'epson' in queue_uri.lower():
        # Bypass colord ICC lookup on Epson ESC/P-R driver (eliminates 25-50s CUPS spool stall)
        cmd.extend(['-o', 'cm-calibration=true'])

    pdf_is_landscape = inspect_pdf_is_landscape(file_path)
    raw_orient = (orientation or 'auto').strip().lower()
    target_orient = raw_orient if raw_orient in ('landscape', 'portrait') else ('landscape' if pdf_is_landscape else 'portrait')

    # Prevent CUPS pdftopdf double-rotation:
    # - When website/pdf-utils already baked an A4 Landscape PDF (w > h), do NOT also pass -o landscape.
    # - Only pass -o landscape if a portrait PDF (h >= w) needs to be rotated to landscape.
    # - If Portrait was explicitly requested for a wide PDF, disable CUPS auto-rotate so it stays upright.
    if target_orient == 'landscape':
        if not pdf_is_landscape:
            cmd.extend(['-o', 'landscape'])
    else:
        if pdf_is_landscape:
            cmd.extend(['-o', 'nopdfAutoRotate', '-o', 'portrait'])

    cmd.extend(get_printer_color_flags(printer_name, color_mode))

    if is_duplex and printer_supports_duplex(printer_name):
        cmd.extend(['-o', 'sides=two-sided-long-edge'])
    else:
        cmd.extend(['-o', 'sides=one-sided'])

    if page_range and str(page_range).lower() != 'all':
        cleaned = re.sub(r'\s+', '', str(page_range))
        if cleaned:
            cmd.extend(['-o', f'page-ranges={cleaned}'])

    cmd.append(file_path)
    log(f"Executing CUPS print: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    log(f"CUPS Output: {res.stdout.strip()}")
    return True


def poll_paid_jobs():
    """Direct Cloudflare D1 poll first (0 Worker quota), fallback to server proxy."""
    norm_id = STATION_ID.lower().strip()
    is_main = norm_id in ('block_b', 'main', 'hostel_block_b_pare', 'pare')
    if is_main:
        sql = """SELECT id, pickup_code, file_name, file_key, total_pages, page_range, color_mode, is_duplex, copies, duplex_sheets, single_sheets, status, station_id, created_at, orientation
                 FROM print_jobs
                 WHERE status = 'PAID' AND (
                   station_id = 'main' OR station_id = 'block_b' OR station_id = 'hostel_block_b_pare' OR station_id = 'pare' OR station_id IS NULL
                 )
                 ORDER BY created_at ASC LIMIT 5"""
        params = []
    else:
        sql = """SELECT id, pickup_code, file_name, file_key, total_pages, page_range, color_mode, is_duplex, copies, duplex_sheets, single_sheets, status, station_id, created_at, orientation
                 FROM print_jobs
                 WHERE status = 'PAID' AND (station_id = ? OR station_id = ?)
                 ORDER BY created_at ASC LIMIT 5"""
        params = [STATION_ID, f"hostel_{STATION_ID}"]

    try:
        res = d1_query(sql, params)
        if res is not None:
            return res[0].get("results", []) or []
    except Exception as d1_err:
        warn(f"Direct D1 poll notice: {d1_err}")

    poll_resp = _session.post(f"{SERVER_URL}/api/daemon/poll", timeout=(3.0, 10.0))
    if poll_resp.status_code == 200:
        return poll_resp.json().get("jobs", []) or []
    if poll_resp.status_code == 401:
        error(f"Access Denied: Station token invalid for [{STATION_ID}].")
    return []


def claim_paid_job(job_id):
    """Direct D1 atomic CAS claim first, with server proxy fallback."""
    try:
        res = d1_query(
            "UPDATE print_jobs SET status = 'PRINTING_ODD' WHERE id = ? AND status = 'PAID'",
            [job_id]
        )
        if res and res[0].get("meta", {}).get("changes", 0) > 0:
            return True
    except Exception as e:
        warn(f"Direct D1 claim notice for {job_id[:8]}: {e}")

    try:
        resp = _session.post(f"{SERVER_URL}/api/daemon/claim", json={"jobId": job_id}, timeout=(3.0, 10.0))
        if resp.status_code == 200:
            return bool(resp.json().get("claimed"))
    except Exception as e:
        warn(f"Server claim notice for {job_id[:8]}: {e}")
    return False


def download_from_r2_direct(file_key, destination_path):
    """Pure-Python AWS SigV4 direct R2 download (zero Worker bandwidth)."""
    if not (R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_ENDPOINT and R2_BUCKET_NAME and file_key):
        return False
    parsed = urllib.parse.urlparse(R2_ENDPOINT)
    host = parsed.netloc
    clean_key = file_key.lstrip('/')
    encoded_key = urllib.parse.quote(clean_key, safe='/')
    canonical_uri = f"/{R2_BUCKET_NAME}/{encoded_key}"
    url = f"{R2_ENDPOINT}{canonical_uri}"

    now_utc = datetime.now(timezone.utc)
    amz_date = now_utc.strftime('%Y%m%dT%H%M%SZ')
    date_stamp = now_utc.strftime('%Y%m%d')
    payload_hash = hashlib.sha256(b'').hexdigest()

    canonical_headers = f"host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = f"GET\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    credential_scope = f"{date_stamp}/auto/s3/aws4_request"
    string_to_sign = f"AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"

    def _sign(k, m):
        return hmac.new(k, m.encode('utf-8'), hashlib.sha256).digest()

    signing_key = _sign(_sign(_sign(_sign(('AWS4' + R2_SECRET_ACCESS_KEY).encode('utf-8'), date_stamp), 'auto'), 's3'), 'aws4_request')
    signature = hmac.new(signing_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()

    headers = {
        'x-amz-date': amz_date,
        'x-amz-content-sha256': payload_hash,
        'Authorization': f"AWS4-HMAC-SHA256 Credential={R2_ACCESS_KEY_ID}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
    }
    resp = _r2_session.get(url, headers=headers, stream=True, timeout=(5.0, 60.0))
    resp.raise_for_status()
    with open(destination_path, 'wb') as f:
        for chunk in resp.iter_content(chunk_size=65536):
            if chunk:
                f.write(chunk)
    return True


def download_cloud_file(job_id, destination_path, file_key=None):
    """Downloads document directly from Cloudflare R2 first, falling back to server proxy."""
    parent = os.path.dirname(destination_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    if file_key:
        try:
            if download_from_r2_direct(file_key, destination_path):
                return
        except Exception as r2_err:
            warn(f"Direct R2 download notice ({r2_err}); trying server fallback...")

    url = f"{SERVER_URL}/api/daemon/job-file?jobId={job_id}"
    resp = _session.get(url, timeout=(5.0, 60.0), stream=True)
    resp.raise_for_status()
    with open(destination_path, 'wb') as f:
        for chunk in resp.iter_content(chunk_size=65536):
            if chunk:
                f.write(chunk)


def update_job_status(job_id, status, pages_printed=None, sheets_used=None):
    """Updates job status via server endpoint on COMPLETED (to deduct supplies) or direct D1."""
    if status == "COMPLETED":
        try:
            r = _session.post(
                f"{SERVER_URL}/api/daemon/status",
                json={"jobId": job_id, "status": status, "pagesPrinted": pages_printed, "sheetsUsed": sheets_used},
                timeout=(3.0, 10.0),
            )
            if r.status_code == 200:
                return
        except Exception as e:
            warn(f"Status update network notice: {e}")

    safe_status = 'PRINTING_ODD' if status == 'PRINTING' else status
    try:
        d1_query("UPDATE print_jobs SET status = ? WHERE id = ?", [safe_status, job_id])
    except Exception as e:
        warn(f"Direct D1 status notice: {e}")


_last_printer_telemetry_sig = None
_last_printer_telemetry_at = 0.0
_heartbeat_cycle = 0
_active_alert_flags = {"temp": False, "power": False, "disk": False, "ram": False}
_last_seen_printers = None


def evaluate_and_send_pi_health_alerts(pi_telem, printers):
    """Monitors Pi thermals, undervoltage, storage, RAM/swap, and USB printer connect/disconnect."""
    global _last_seen_printers

    # 1. CPU Temperature
    temp_c = pi_telem.get("cpu_temp_c")
    if isinstance(temp_c, (int, float)):
        if temp_c >= 80.0:
            _active_alert_flags["temp"] = True
            send_wa_admin_alert("pi_temp", "critical", "Critical Pi CPU Temperature", f"CPU temperature reached *{temp_c}°C* (throttling >= 80°C).\nCheck airflow / cooling!", cooldown_sec=1800)
        elif temp_c >= 72.0:
            _active_alert_flags["temp"] = True
            send_wa_admin_alert("pi_temp", "warn", "High Pi CPU Temperature", f"CPU temperature elevated at *{temp_c}°C* (normal ~46°C).", cooldown_sec=1800)
        elif _active_alert_flags["temp"] and temp_c < 65.0:
            _active_alert_flags["temp"] = False
            send_wa_admin_alert("pi_temp_recovery", "recovery", "Pi Temperature Normal", f"CPU cooled down to *{temp_c}°C*.", cooldown_sec=0)

    # 2. Power / Active Undervoltage
    if pi_telem.get("undervoltage_now") or pi_telem.get("throttled_now"):
        _active_alert_flags["power"] = True
        send_wa_admin_alert("pi_undervoltage", "warn", "Pi Undervoltage / CPU Throttling", "Raspberry Pi voltage dropped below 4.63V during load.\nCheck 5V power adapter/cable to keep full 1.4 GHz speed.", cooldown_sec=1800)
    elif _active_alert_flags["power"]:
        _active_alert_flags["power"] = False
        send_wa_admin_alert("pi_undervoltage_recovery", "recovery", "Pi Power Restored", "5V supply voltage is healthy and throttling cleared.", cooldown_sec=0)

    # 3. Storage Space
    free_gb = pi_telem.get("disk_free_gb")
    used_pct = pi_telem.get("disk_used_pct")
    if isinstance(free_gb, (int, float)):
        if free_gb < 2.0:
            _active_alert_flags["disk"] = True
            send_wa_admin_alert("pi_disk", "critical", "Critical Low Pi Storage", f"Only *{free_gb} GB* free ({used_pct}% used)! Running emergency archive prune.", cooldown_sec=1800)
            threading.Thread(target=cleanup_usb_storage, daemon=True).start()
        elif free_gb < 5.0 or (isinstance(used_pct, (int, float)) and used_pct >= 88.0):
            _active_alert_flags["disk"] = True
            send_wa_admin_alert("pi_disk", "warn", "Low Pi Storage Space", f"Storage running low: *{free_gb} GB* free ({used_pct}% used).", cooldown_sec=3600)
        elif _active_alert_flags["disk"] and free_gb >= 6.0:
            _active_alert_flags["disk"] = False
            send_wa_admin_alert("pi_disk_recovery", "recovery", "Pi Storage Healthy", f"Disk cleanup freed space: *{free_gb} GB* available.", cooldown_sec=0)

    # 4. RAM & Swap Pressure
    ram_pct = pi_telem.get("ram_used_pct") or 0
    swap_mb = pi_telem.get("swap_used_mb") or 0
    if ram_pct >= 90.0 or swap_mb >= 1024:
        _active_alert_flags["ram"] = True
        send_wa_admin_alert("pi_ram", "warn", "High Pi Memory / Swap Usage", f"RAM used: *{ram_pct}%* ({pi_telem.get('ram_used_mb')}/{pi_telem.get('ram_total_mb')} MB) · Swap: *{swap_mb} MB*.", cooldown_sec=1800)
    elif _active_alert_flags["ram"] and ram_pct < 75.0 and swap_mb < 512:
        _active_alert_flags["ram"] = False
        send_wa_admin_alert("pi_ram_recovery", "recovery", "Pi Memory Normal", f"RAM usage stabilized at *{ram_pct}%*.", cooldown_sec=0)

    # 5. USB Printer Connect / Disconnect / Model Swap Recovery
    cur_tuple = tuple(printers or [])
    if _last_seen_printers is not None and cur_tuple != _last_seen_printers:
        invalidate_printer_cache()
        if len(cur_tuple) == 0 and len(_last_seen_printers) > 0:
            send_wa_admin_alert("printer_usb", "warn", "USB Printer Disconnected", f"Previously active printer `{_last_seen_printers[0]}` was unplugged or powered off.\nRe-plug USB/power anytime to resume.", cooldown_sec=300)
        elif len(cur_tuple) > 0:
            ensure_cups_printer_enabled(cur_tuple[0])
            action_word = "Reconnected" if len(_last_seen_printers) == 0 else "Switched"
            send_wa_admin_alert("printer_usb_recovery", "recovery", f"USB Printer {action_word}", f"Active CUPS printer ready: `{cur_tuple[0]}`.", cooldown_sec=0)
    _last_seen_printers = cur_tuple


def write_heartbeat():
    """Sends hardware & Raspberry Pi telemetry directly to D1 first (0 Worker usage), with HTTP fallback."""
    global _last_printer_telemetry_sig, _last_printer_telemetry_at, _heartbeat_cycle
    _heartbeat_cycle += 1
    printers = get_available_cups_printers()
    is_printer_connected = 1 if len(printers) > 0 else 0
    printer_label = printers[0] if printers else "Printer Disconnected"
    status_text = f"Ready ({printers[0]})" if printers else "Printer Disconnected"
    spooler_jobs = get_cups_queue_count()
    pi_telem = get_linux_system_telemetry()
    evaluate_and_send_pi_health_alerts(pi_telem, printers)

    if CF_ACCOUNT_ID and CF_API_TOKEN and CF_D1_DB_ID:
        if time.monotonic() < _d1_backoff_until:
            return
        try:
            slot = 1 if STATION_ID in ('block_b', 'main', 'hostel_block_b_pare') else 2
            d1_query(
                "INSERT INTO daemon_heartbeat (id, updated_at, station_id) VALUES (?, datetime('now'), ?) "
                "ON CONFLICT(id) DO UPDATE SET updated_at = datetime('now'), station_id = excluded.station_id",
                [slot, STATION_ID],
            )
            if _heartbeat_cycle % 2 == 1:
                d1_query(
                    "UPDATE stations SET last_heartbeat = datetime('now'), status = 'online' WHERE id = ? OR id = 'hostel_' || ?",
                    [STATION_ID, STATION_ID],
                )
            telem_sig = (printer_label, is_printer_connected, status_text, spooler_jobs)
            now_mono = time.monotonic()
            if STATION_ID in ('block_b', 'main', 'hostel_block_b_pare') and (
                telem_sig != _last_printer_telemetry_sig or (now_mono - _last_printer_telemetry_at) > 240
            ):
                d1_query(
                    "UPDATE printer_telemetry SET printer_name = ?, is_online = ?, status_text = ?, spooler_jobs = ?, updated_at = datetime('now') WHERE id = 1",
                    [printer_label, is_printer_connected, status_text, spooler_jobs],
                )
                _last_printer_telemetry_sig = telem_sig
                _last_printer_telemetry_at = now_mono
            if _heartbeat_cycle % 2 == 0 or _heartbeat_cycle == 1:
                d1_query(
                    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
                    [f"pi_telemetry_{STATION_ID}", json.dumps(pi_telem)],
                )
            return
        except Exception as d1_err:
            warn(f"Direct D1 heartbeat notice: {d1_err}")

    try:
        _session.post(
            f"{SERVER_URL}/api/daemon/heartbeat",
            json={
                "station_id": STATION_ID,
                "telemetry": {
                    "name": printer_label,
                    "is_online": is_printer_connected,
                    "status_text": status_text,
                    "spooler_jobs": spooler_jobs,
                },
                "system_telemetry": pi_telem,
            },
            timeout=(3.0, 8.0),
        )
    except Exception:
        pass


def heartbeat_worker():
    """Background thread sending 30s heartbeats + Pi telemetry."""
    time.sleep(1.0)
    while True:
        try:
            write_heartbeat()
        except Exception:
            pass
        time.sleep(HEARTBEAT_INTERVAL_SECONDS)


def archive_printed_file_async(src_path, dst_path):
    """Moves printed spool file from RAM/temp storage to USB archive asynchronously."""
    def _worker():
        try:
            if os.path.exists(src_path):
                shutil.move(src_path, dst_path)
        except Exception as e:
            warn(f"Archive move notice: {e}")
    threading.Thread(target=_worker, daemon=True).start()


def main():
    ensure_station_paired()

    log("======================================================")
    log("PrintKurox Embedded Linux / Pi 3B+ Daemon Starting")
    log(f"Station ID:    {STATION_ID}")
    log(f"Direct D1/R2:  {'Enabled' if (CF_ACCOUNT_ID and CF_API_TOKEN and CF_D1_DB_ID) else 'Proxy Fallback Only'}")
    log(f"Spool Dir:     {ACTIVE_SPOOL_DIR}")
    log(f"Fallback URL:  {SERVER_URL}")
    log(f"Adaptive Poll: {POLL_INTERVAL_SECONDS}s idle / 0.4s active")
    log("======================================================")

    threading.Thread(target=heartbeat_worker, daemon=True).start()
    threading.Thread(target=storage_cleanup_worker, daemon=True).start()
    threading.Thread(target=start_local_wake_server, daemon=True).start()

    last_poll_had_jobs = False

    while True:
        _wake_event.clear()
        try:
            jobs = poll_paid_jobs()

            if jobs:
                last_poll_had_jobs = True
                log(f"Found {len(jobs)} pending print job(s) in queue!")

                target_printer = resolve_target_printer()
                if not target_printer:
                    error("Cannot print: No CUPS printer detected over USB! Waiting...")
                    time.sleep(5)
                    continue

                for job in jobs:
                    t_start = time.monotonic()
                    job_id = job["id"]
                    pickup_code = job.get("pickup_code", "#0000")
                    file_name = job.get("file_name", "document.pdf")
                    file_key = job.get("file_key")
                    total_pages = int(job.get("total_pages") or 1)
                    is_duplex = bool(job.get("is_duplex"))
                    color_mode = job.get("color_mode", "bw")
                    copies = max(1, int(job.get("copies") or 1))
                    duplex_sheets = int(job.get("duplex_sheets") or 0)
                    single_sheets = int(job.get("single_sheets") or 0)
                    page_range = job.get("page_range", "All")
                    orientation = job.get("orientation", "auto")

                    log(f"Processing Job {pickup_code} ({file_name}) — {total_pages} pgs, Copies: {copies}, Orient: {orientation}")

                    if not claim_paid_job(job_id):
                        warn(f"Job {job_id[:8]} was already claimed. Skipping.")
                        continue

                    clean_name = re.sub(r'[^a-zA-Z0-9._-]', '_', file_name) or "doc.pdf"
                    local_pdf = os.path.join(ACTIVE_SPOOL_DIR, f"{pickup_code}_{job_id[:6]}_{clean_name}")

                    # Notify PRINTING asynchronously so R2 download & CUPS aren't blocked by D1 round-trip
                    threading.Thread(target=update_job_status, args=(job_id, "PRINTING"), daemon=True).start()

                    try:
                        download_cloud_file(job_id, local_pdf, file_key=file_key)
                        log(f"Downloaded document in {time.monotonic() - t_start:.2f}s: {os.path.basename(local_pdf)}")
                    except Exception as dl_err:
                        error(f"Failed to download job {pickup_code}: {dl_err}")
                        update_job_status(job_id, "FAILED")
                        continue

                    try:
                        print_pdf_cups(
                            printer_name=target_printer,
                            file_path=local_pdf,
                            copies=copies,
                            color_mode=color_mode,
                            is_duplex=is_duplex,
                            page_range=page_range,
                            orientation=orientation,
                        )
                        pages_printed_total = total_pages * copies
                        per_copy_sheets = (duplex_sheets + single_sheets) if (duplex_sheets + single_sheets) > 0 else (
                            math.ceil(total_pages / 2) if is_duplex else total_pages
                        )
                        sheets_used_total = per_copy_sheets * copies

                        log(f"Spool submitted for Job {pickup_code} in {time.monotonic() - t_start:.2f}s on {target_printer} ({pages_printed_total} pgs, {sheets_used_total} sheets)!")
                        threading.Thread(
                            target=update_job_status,
                            args=(job_id, "COMPLETED"),
                            kwargs={"pages_printed": pages_printed_total, "sheets_used": sheets_used_total},
                            daemon=True,
                        ).start()

                        archive_path = os.path.join(ARCHIVE_DIR, os.path.basename(local_pdf))
                        archive_printed_file_async(local_pdf, archive_path)
                    except Exception as print_err:
                        error(f"CUPS printing failed for {pickup_code}: {print_err}")
                        invalidate_printer_cache()
                        update_job_status(job_id, "FAILED")
            else:
                last_poll_had_jobs = False

        except requests.exceptions.RequestException as net_err:
            warn(f"Network glitch contacting server: {net_err}. Retrying...")
            time.sleep(3)
        except Exception as e:
            error(f"Unexpected error in daemon loop: {e}")
            time.sleep(2)

        wait_time = 0.4 if last_poll_had_jobs else POLL_INTERVAL_SECONDS
        _wake_event.wait(timeout=wait_time)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        log("Daemon terminated gracefully.")
        sys.exit(0)
