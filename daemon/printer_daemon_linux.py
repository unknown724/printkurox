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
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Base Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'station_config.json')
DEVICE_IDENTITY_PATH = os.path.join(BASE_DIR, 'device_identity.json')
TEMP_DIR = os.path.join(BASE_DIR, 'temp_prints')
SHM_SPOOL_DIR = '/tmp/printkurox_spool'
ARCHIVE_DIR = os.path.join(BASE_DIR, 'printed_archive')

import showcase_state as ss

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(ARCHIVE_DIR, exist_ok=True)


def _resolve_active_spool_dir():
    """Prefer RAM tmpfs (/tmp) for active spool files (immune to systemd-logind RemoveIPC)."""
    try:
        if os.path.isdir('/tmp'):
            free_mb = shutil.disk_usage('/tmp').free / (1024 * 1024)
            if free_mb >= 100.0:
                os.makedirs(SHM_SPOOL_DIR, exist_ok=True)
                return SHM_SPOOL_DIR
    except Exception:
        pass
    return TEMP_DIR


ACTIVE_SPOOL_DIR = _resolve_active_spool_dir()

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
    """Queries CUPS for configured local printers, filtering out self-looped localhost:631 aliases."""
    try:
        res = subprocess.run(['lpstat', '-e'], capture_output=True, text=True, timeout=5)
        queue_uris = ss.get_cups_queue_uris()
        printers = []
        for raw in res.stdout.strip().split('\n'):
            p = raw.strip()
            if not p or ss.is_cups_loopback_alias(p, queue_uris.get(p, '')):
                continue
            printers.append(p)
        return printers
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
_cached_queue_uris = None
_cached_color_flags = {}
_cached_duplex_support = {}


def invalidate_printer_cache():
    global _cached_printer_name, _cached_queue_uris
    _cached_printer_name = None
    _cached_queue_uris = None


def _get_cached_queue_uris(force=False):
    global _cached_queue_uris
    if _cached_queue_uris is None or force:
        _cached_queue_uris = ss.get_cups_queue_uris()
    return _cached_queue_uris


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
    queue_uris = _get_cached_queue_uris(force=True)

    # Fast non-destructive check via lsusb first (avoids running lpinfo -v which detaches usblp0 for ~3s)
    connected_queues = [
        p for p in available
        if ss.is_cups_queue_physically_present(p, queue_uris, None)
    ]
    physical = []
    if not connected_queues:
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


def _pick_ppd_choice(values_str, preferred_lower):
    """Picks exact case-sensitive PPD choice token matching priority list."""
    tokens = [t.lstrip('*').strip() for t in (values_str or '').split() if t.strip()]
    lower_map = {t.lower(): t for t in tokens}
    for cand in preferred_lower:
        if cand in lower_map:
            return lower_map[cand]
    for tok in tokens:
        tl = tok.lower()
        if any(cand in tl for cand in preferred_lower):
            return tok
    return None


def get_printer_color_flags(printer_name, color_mode):
    """Detects exact PPD color keys & values (Ink=MONO/COLOR, ColorModel=Gray/RGB, Grayscale/Color, etc.)."""
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
                    m_ink = re.search(r'^Ink(?:/[^:]*)?:\s*(.+)$', res.stdout, re.MULTILINE)
                    m_cm = re.search(r'^ColorModel(?:/[^:]*)?:\s*(.+)$', res.stdout, re.MULTILINE)
                    if m_ink:
                        bw_tok = _pick_ppd_choice(m_ink.group(1), ('mono', 'gray', 'grayscale', 'black')) or 'MONO'
                        col_tok = _pick_ppd_choice(m_ink.group(1), ('color', 'rgb', 'cmyk')) or 'COLOR'
                        bw_flags = ['-o', f'Ink={bw_tok}']
                        color_flags = ['-o', f'Ink={col_tok}']
                    elif m_cm:
                        bw_tok = _pick_ppd_choice(m_cm.group(1), ('gray', 'grayscale', 'monochrome', 'mono', 'kgray', 'black')) or 'Grayscale'
                        col_tok = _pick_ppd_choice(m_cm.group(1), ('rgb', 'color', 'srgb', 'cmyk')) or 'Color'
                        bw_flags = ['-o', f'ColorModel={bw_tok}']
                        color_flags = ['-o', f'ColorModel={col_tok}']
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


def inspect_pdf_orientation_stats(file_path):
    """Returns (first_is_landscape, is_mixed_orientation) accounting for /Rotate across up to 20 pages."""
    if not str(file_path).lower().endswith('.pdf'):
        try:
            with open(file_path, 'rb') as f:
                if f.read(16).lstrip()[:5] != b'%PDF-':
                    return False, False
        except Exception:
            return False, False

    # Prefer pypdf if installed, else Poppler `pdfinfo -f 1 -l 20` (fast & exact regardless of PDF byte layout)
    try:
        import pypdf
        reader = pypdf.PdfReader(file_path)
        if len(reader.pages) > 0:
            flags = []
            for p in reader.pages[:20]:
                w = float(p.mediabox.width)
                h = float(p.mediabox.height)
                rot = int(p.get('/Rotate', 0) or 0) % 360
                if rot in (90, 270):
                    w, h = h, w
                flags.append(w > h)
            return flags[0], (len(set(flags)) > 1)
    except Exception:
        pass

    try:
        info = subprocess.run(
            ['pdfinfo', '-f', '1', '-l', '20', file_path],
            capture_output=True, text=True, timeout=4
        )
        if info.returncode == 0 and info.stdout:
            dims = {}
            rots = {}
            for line in info.stdout.splitlines():
                ms = re.match(r'^Page\s+(\d+)\s+size:\s*([0-9.]+)\s*x\s*([0-9.]+)', line.strip())
                if ms:
                    dims[int(ms.group(1))] = (float(ms.group(2)), float(ms.group(3)))
                mr = re.match(r'^Page\s+(\d+)\s+rot:\s*(-?\d+)', line.strip())
                if mr:
                    rots[int(mr.group(1))] = int(mr.group(2)) % 360
            if dims:
                flags = []
                for pnum in sorted(dims):
                    w, h = dims[pnum]
                    if rots.get(pnum, 0) in (90, 270):
                        w, h = h, w
                    flags.append(w > h)
                return flags[0], (len(set(flags)) > 1)
    except Exception:
        pass

    # Pure-Python header fallback if neither pypdf nor pdfinfo is available
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
                return (w > h), False
    except Exception:
        pass
    return False, False


def _ensure_safe_a4_pdf_if_raw_image(file_path):
    """Converts a raw non-PDF image into an EXIF-oriented A4 PDF with safe 18pt margins so CUPS never crops edges."""
    try:
        with open(file_path, 'rb') as f:
            if f.read(1024).lstrip().startswith(b'%PDF-'):
                return file_path
    except Exception:
        return file_path

    try:
        from PIL import Image, ImageOps
        img = Image.open(file_path)
        img = ImageOps.exif_transpose(img)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        # Place on A4 150 DPI canvas (1240 x 1754 px) with 4% safe hardware margins (~3mm+ clearance)
        canvas_w, canvas_h = 1240, 1754
        if img.width > img.height:
            img = img.rotate(90, expand=True)
        pad = 50
        img.thumbnail((canvas_w - pad * 2, canvas_h - pad * 2), Image.Resampling.LANCZOS)
        sheet = Image.new('RGB', (canvas_w, canvas_h), (255, 255, 255))
        sheet.paste(img, ((canvas_w - img.width) // 2, (canvas_h - img.height) // 2))
        out_pdf = f"{file_path}.a4.pdf"
        sheet.save(out_pdf, 'PDF', resolution=150.0)
        return out_pdf
    except Exception as img_err:
        warn(f"Raw image A4 wrap skipped for {os.path.basename(file_path)}: {img_err}")
        return file_path


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
        # 1. Clean temp_prints & RAM spool > 2 hours
        cutoff_temp = now - (2 * 3600)
        for spool_dir in {TEMP_DIR, SHM_SPOOL_DIR}:
            if not os.path.isdir(spool_dir):
                continue
            for fn in os.listdir(spool_dir):
                fp = os.path.join(spool_dir, fn)
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


def _format_cups_page_ranges(page_range, total_pages=0):
    """Formats CUPS page-ranges cleanly and omits it when all pages 1..N are selected."""
    if not page_range or str(page_range).strip().lower() in ('', 'all'):
        return None
    raw = re.sub(r'\s+', '', str(page_range))
    if not raw:
        return None

    pages = set()
    try:
        for part in raw.split(','):
            if not part:
                continue
            if '-' in part:
                a_s, b_s = part.split('-', 1)
                a, b = int(a_s), int(b_s)
                lo, hi = min(a, b), max(a, b)
                for n in range(max(1, lo), hi + 1):
                    pages.add(n)
            else:
                n = int(part)
                if n >= 1:
                    pages.add(n)
    except Exception:
        return raw

    if not pages:
        return None
    sorted_p = sorted(pages)
    if total_pages and total_pages >= 1 and sorted_p == list(range(1, total_pages + 1)):
        return None

    ranges = []
    start = prev = sorted_p[0]
    for n in sorted_p[1:]:
        if n == prev + 1:
            prev = n
        else:
            ranges.append(f"{start}" if start == prev else f"{start}-{prev}")
            start = prev = n
    ranges.append(f"{start}" if start == prev else f"{start}-{prev}")
    return ",".join(ranges)


_PPD_CACHE_DIR = '/tmp/printkurox_ppd'
_CUPS_FILTER_DIR = '/usr/lib/cups/filter'
_PRESPOOL_MIN_FREE_MB = 150.0
_PRESPOOL_MAX_PDF_MB = 25.0
_PRESPOOL_MAX_PRN_MB = 140.0
_PRESPOOL_BATCH_PAGES = 2
_PRESPOOL_LOOKAHEAD_BATCHES = 3
_CUPS_SPOOL_DIR = '/var/spool/cups'


def _get_readable_ppd_path(printer_name):
    """Returns a readable local PPD path for printer_name (caches under RAM /tmp so non-root filters match printer resolution)."""
    if not printer_name:
        return None
    sys_ppd = f'/etc/cups/ppd/{printer_name}.ppd'
    if os.path.isfile(sys_ppd) and os.access(sys_ppd, os.R_OK):
        return sys_ppd

    cached = os.path.join(_PPD_CACHE_DIR, f'{printer_name}.ppd')
    if os.path.isfile(cached) and os.path.getsize(cached) > 512:
        return cached

    os.makedirs(_PPD_CACHE_DIR, exist_ok=True)
    # 1. CUPS HTTP endpoint serves queue PPD without sudo
    try:
        r = requests.get(f'http://127.0.0.1:631/printers/{urllib.parse.quote(printer_name)}.ppd', timeout=2.0)
        if r.status_code == 200 and len(r.content) > 512 and b'*PPD-Adobe' in r.content[:256]:
            with open(cached, 'wb') as f:
                f.write(r.content)
            return cached
    except Exception:
        pass

    # 2. Passwordless sudo read fallback (Pi default)
    try:
        res = subprocess.run(['sudo', '-n', 'cat', sys_ppd], capture_output=True, timeout=3)
        if res.returncode == 0 and len(res.stdout) > 512:
            with open(cached, 'wb') as f:
                f.write(res.stdout)
            return cached
    except Exception:
        pass
    return None


def _detect_prespool_driver(ppd_path):
    """Returns ('escpr'|'gutenprint', filter_binary_path) if PPD supports RAM pre-spooling, else (None, None)."""
    if not ppd_path or not os.path.isfile(ppd_path):
        return None, None
    try:
        with open(ppd_path, 'rb') as f:
            head = f.read(32768)
        if b'epson-escpr-wrapper' in head:
            b = os.path.join(_CUPS_FILTER_DIR, 'epson-escpr-wrapper')
            if os.path.exists(b):
                return 'escpr', b
        if b'rastertogutenprint.5.3' in head:
            b = os.path.join(_CUPS_FILTER_DIR, 'rastertogutenprint.5.3')
            if os.path.exists(b):
                return 'gutenprint', b
    except Exception:
        pass
    return None, None


def _should_use_pdftoraster(pdf_path):
    """Uses Poppler pdftoraster (~1.8x faster) for fontless high-PPI image scans; gstoraster for text/mixed PDFs."""
    if not os.path.exists(os.path.join(_CUPS_FILTER_DIR, 'pdftoraster')):
        return False
    try:
        f_res = subprocess.run(['pdffonts', pdf_path], capture_output=True, text=True, timeout=3)
        if f_res.returncode != 0:
            return False
        font_lines = [ln for ln in f_res.stdout.splitlines() if ln.strip()]
        if len(font_lines) > 2:
            return False

        i_res = subprocess.run(['pdfimages', '-list', '-f', '1', '-l', '5', pdf_path], capture_output=True, text=True, timeout=3)
        if i_res.returncode != 0:
            return False
        for line in i_res.stdout.splitlines()[2:]:
            cols = line.split()
            if len(cols) >= 14 and cols[2] == 'image':
                try:
                    w = int(cols[3])
                    x_ppi = float(cols[12])
                    if x_ppi >= 200.0 or w >= 1800:
                        return True
                except ValueError:
                    continue
    except Exception:
        pass
    return False


def _run_filter_chain_to_prn(printer_name, pdf_path, opts_str, ppd_path, raster_bin, driver_kind, driver_bin, out_prn_path):
    """Runs pdftopdf -> <raster_bin> -> <driver_bin> fully buffered into out_prn_path."""
    pdftopdf_bin = os.path.join(_CUPS_FILTER_DIR, 'pdftopdf')
    env = os.environ.copy()
    env['PPD'] = ppd_path
    env['PRINTER'] = printer_name

    p1 = subprocess.Popen(
        [pdftopdf_bin, '0', 'pi', 'printkurox', '1', opts_str, pdf_path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env
    )
    p2 = subprocess.Popen(
        [raster_bin, '0', 'pi', 'printkurox', '1', opts_str],
        stdin=p1.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env
    )
    p1.stdout.close()

    driver_argv = (
        [printer_name, '0', 'pi', 'printkurox', '1', opts_str]
        if driver_kind == 'escpr'
        else [driver_bin, '0', 'pi', 'printkurox', '1', opts_str]
    )
    with open(out_prn_path, 'wb') as out_f:
        p3 = subprocess.Popen(
            driver_argv,
            executable=driver_bin,
            stdin=p2.stdout, stdout=out_f, stderr=subprocess.PIPE, env=env
        )
        p2.stdout.close()
        _, e3 = p3.communicate(timeout=180)

    e2 = p2.stderr.read() if p2.stderr else b''
    e1 = p1.stderr.read() if p1.stderr else b''
    rc2 = p2.wait(timeout=5)
    rc1 = p1.wait(timeout=5)
    if rc1 != 0 or rc2 != 0 or p3.returncode != 0:
        err_txt = (e3 or e2 or e1).decode('utf-8', 'replace').strip()[:240]
        raise RuntimeError(f"filter rc=({rc1},{rc2},{p3.returncode}): {err_txt}")


def _get_pdf_page_count(pdf_path, hint_pages=0):
    """Reads exact page count via pdfinfo/pypdf (falls back to hint_pages)."""
    try:
        res = subprocess.run(['pdfinfo', pdf_path], capture_output=True, text=True, timeout=3)
        if res.returncode == 0:
            m = re.search(r'^Pages:\s*(\d+)', res.stdout, re.MULTILINE)
            if m:
                return int(m.group(1))
    except Exception:
        pass
    try:
        import pypdf
        return len(pypdf.PdfReader(pdf_path).pages)
    except Exception:
        pass
    return max(0, int(hint_pages or 0))


def _resolve_target_pages(pdf_path, formatted_ranges, total_pages=0):
    """Returns ordered 1-based page list to print, or [] if page count cannot be determined."""
    n_pages = _get_pdf_page_count(pdf_path, hint_pages=total_pages)
    if n_pages <= 0:
        return []
    if not formatted_ranges:
        return list(range(1, n_pages + 1))
    pages = set()
    for part in str(formatted_ranges).split(','):
        if '-' in part:
            a_s, b_s = part.split('-', 1)
            for p in range(max(1, int(a_s)), min(n_pages, int(b_s)) + 1):
                pages.add(p)
        elif part.isdigit():
            p = int(part)
            if 1 <= p <= n_pages:
                pages.add(p)
    return sorted(pages)


def _group_pages_into_range_strings(pages, batch_size=_PRESPOOL_BATCH_PAGES):
    """Groups sorted page numbers into CUPS page-ranges strings of at most batch_size pages each."""
    groups = []
    for i in range(0, len(pages), batch_size):
        chunk = pages[i:i + batch_size]
        sub = []
        s = e = chunk[0]
        for p in chunk[1:]:
            if p == e + 1:
                e = p
            else:
                sub.append(str(s) if s == e else f"{s}-{e}")
                s = e = p
        sub.append(str(s) if s == e else f"{s}-{e}")
        groups.append(",".join(sub))
    return groups


def _verify_prespool_stream_complete(prn_path, driver_kind):
    """Confirms the rendered printer stream ends cleanly (guards against silent filter truncation)."""
    sz = os.path.getsize(prn_path)
    if sz <= 1024:
        return False
    if driver_kind == 'escpr':
        with open(prn_path, 'rb') as f:
            f.seek(max(0, sz - 256))
            tail = f.read(256)
        return (b'endp' in tail) and (b'endj' in tail)
    return True


def _prespool_single_job_to_ram(printer_name, pdf_path, lp_opt_tokens, ppd_path, driver_kind, driver_bin, candidates, range_str=None, max_prn_mb=_PRESPOOL_MAX_PRN_MB):
    """Renders pdf_path (or range_str slice) to a RAM .prn file under /tmp/printkurox_spool."""
    os.makedirs(SHM_SPOOL_DIR, exist_ok=True)
    tokens = [t for t in lp_opt_tokens if not t.startswith('page-ranges=')]
    if range_str:
        tokens.append(f'page-ranges={range_str}')
    opts_str = ' '.join(tokens)
    suffix = (range_str or 'all').replace(',', '_').replace('-', '_')
    prn_path = os.path.join(SHM_SPOOL_DIR, f"escpr_{os.getpid()}_{threading.get_ident()}_{int(time.time() * 1000)}_{suffix}.prn")

    for raster_bin in candidates:
        t0 = time.monotonic()
        try:
            _run_filter_chain_to_prn(printer_name, pdf_path, opts_str, ppd_path, raster_bin, driver_kind, driver_bin, prn_path)
            prn_mb = os.path.getsize(prn_path) / (1024 * 1024)
            if 0.001 < prn_mb <= max_prn_mb and _verify_prespool_stream_complete(prn_path, driver_kind):
                return prn_path, os.path.basename(raster_bin), (time.monotonic() - t0)
            warn(f"RAM pre-spool incomplete or out of bounds ({prn_mb:.2f}MB); using standard lp fallback")
        except Exception as e:
            warn(f"RAM pre-spool ({os.path.basename(raster_bin)}) fallback note: {e}")
        if os.path.exists(prn_path):
            try:
                os.remove(prn_path)
            except Exception:
                pass
    return None, None, 0.0


def _wait_for_cups_spool_headroom(needed_mb, max_wait_sec=120):
    """Backpressure guard so multi-batch streaming never overflows the 160M /var/spool/cups tmpfs."""
    deadline = time.monotonic() + max_wait_sec
    while time.monotonic() < deadline:
        q_count = get_cups_queue_count()
        spool_free_mb = 999.0
        try:
            if os.path.isdir(_CUPS_SPOOL_DIR):
                spool_free_mb = shutil.disk_usage(_CUPS_SPOOL_DIR).free / (1024 * 1024)
        except Exception:
            pass
        if q_count <= 2 and spool_free_mb >= (needed_mb + 20.0):
            return
        time.sleep(0.5)


def _submit_raw_prn_to_cups(printer_name, prn_path, copy_label="1/1"):
    """Submits one pre-rendered .prn file to CUPS with -o raw."""
    raw_cmd = ['lp']
    if printer_name:
        raw_cmd.extend(['-d', printer_name])
    raw_cmd.extend(['-o', 'raw', prn_path])
    log(f"Executing CUPS raw print ({copy_label}): {' '.join(raw_cmd)}")
    res = subprocess.run(raw_cmd, capture_output=True, text=True, check=True)
    log(f"CUPS Output: {res.stdout.strip()}")


def _prepare_prespool_context(printer_name, pdf_path):
    """Validates RAM headroom, readable PPD, supported driver, and rasterizer candidate list."""
    pdftopdf_bin = os.path.join(_CUPS_FILTER_DIR, 'pdftopdf')
    gs_bin = os.path.join(_CUPS_FILTER_DIR, 'gstoraster')
    pop_bin = os.path.join(_CUPS_FILTER_DIR, 'pdftoraster')
    if not (os.path.exists(pdftopdf_bin) and os.path.exists(gs_bin) and os.path.isdir('/tmp')):
        return None
    try:
        shm_free_mb = shutil.disk_usage('/tmp').free / (1024 * 1024)
        pdf_mb = os.path.getsize(pdf_path) / (1024 * 1024)
    except Exception:
        return None
    if shm_free_mb < _PRESPOOL_MIN_FREE_MB or pdf_mb > _PRESPOOL_MAX_PDF_MB:
        return None

    ppd_path = _get_readable_ppd_path(printer_name)
    driver_kind, driver_bin = _detect_prespool_driver(ppd_path)
    if not driver_kind:
        return None

    use_pop = _should_use_pdftoraster(pdf_path)
    candidates = ([pop_bin, gs_bin] if use_pop else [gs_bin])
    return ppd_path, driver_kind, driver_bin, candidates


def _prespool_escpr_to_ram(printer_name, pdf_path, lp_opt_tokens):
    """Single-file RAM pre-spool helper (also kept compatible with verification tests)."""
    ctx = _prepare_prespool_context(printer_name, pdf_path)
    if not ctx:
        return None, None, 0.0
    ppd_path, driver_kind, driver_bin, candidates = ctx
    return _prespool_single_job_to_ram(printer_name, pdf_path, lp_opt_tokens, ppd_path, driver_kind, driver_bin, candidates)


def _try_pipelined_batch_print(printer_name, pdf_path, lp_opt_tokens, batch_ranges, dry_run=False):
    """
    Renders batch 1..N across up to 3 CPU workers with bounded lookahead so page 1-2
    starts printing within seconds while subsequent pages render in parallel.
    """
    ctx = _prepare_prespool_context(printer_name, pdf_path)
    if not ctx:
        return False
    ppd_path, driver_kind, driver_bin, candidates = ctx

    in_flight = []
    submitted_any = False
    t_job = time.monotonic()
    with ThreadPoolExecutor(max_workers=min(3, len(batch_ranges))) as pool:
        try:
            next_idx = 0
            while next_idx < len(batch_ranges) and len(in_flight) < _PRESPOOL_LOOKAHEAD_BATCHES:
                rng = batch_ranges[next_idx]
                fut = pool.submit(
                    _prespool_single_job_to_ram,
                    printer_name, pdf_path, lp_opt_tokens, ppd_path, driver_kind, driver_bin, candidates, rng, 90.0
                )
                in_flight.append((next_idx + 1, rng, fut))
                next_idx += 1

            while in_flight:
                b_num, rng, fut = in_flight.pop(0)
                prn_path, filter_tag, pre_sec = fut.result()
                if not prn_path:
                    if not submitted_any:
                        return False
                    raise RuntimeError(f"Batch {b_num} ({rng}) pre-spool failed mid-stream")

                # Keep lookahead queue filled on idle CPU cores before submitting this batch
                while next_idx < len(batch_ranges) and len(in_flight) < _PRESPOOL_LOOKAHEAD_BATCHES:
                    nrng = batch_ranges[next_idx]
                    nfut = pool.submit(
                        _prespool_single_job_to_ram,
                        printer_name, pdf_path, lp_opt_tokens, ppd_path, driver_kind, driver_bin, candidates, nrng, 90.0
                    )
                    in_flight.append((next_idx + 1, nrng, nfut))
                    next_idx += 1

                prn_mb = os.path.getsize(prn_path) / (1024 * 1024)
                try:
                    log(f"Batch {b_num}/{len(batch_ranges)} (pages {rng}) ready via {filter_tag} in {pre_sec:.2f}s ({prn_mb:.2f} MB) | total elapsed {time.monotonic() - t_job:.2f}s")
                    if not dry_run:
                        _wait_for_cups_spool_headroom(prn_mb)
                        _submit_raw_prn_to_cups(printer_name, prn_path, f"batch {b_num}/{len(batch_ranges)} pgs {rng}")
                        submitted_any = True
                finally:
                    if os.path.exists(prn_path):
                        try:
                            os.remove(prn_path)
                        except Exception:
                            pass
            return True
        except Exception as batch_err:
            for _, _, pf in in_flight:
                pf.cancel()
            if submitted_any:
                raise
            warn(f"Pipelined batch pre-spool fallback note: {batch_err}")
            return False


def print_pdf_cups(printer_name, file_path, copies=1, color_mode='bw', is_duplex=False, page_range=None, orientation='auto', total_pages=0):
    """Prints a PDF using pipelined multi-core RAM pre-spooling when safe, or native CUPS lp fallback."""
    effective_path = _ensure_safe_a4_pdf_if_raw_image(file_path)
    queue_uri = _get_cached_queue_uris().get(printer_name or '', '')
    opt_tokens = ['PageSize=A4', 'fit-to-page', 'position=center']
    if 'epson' in (printer_name or '').lower() or 'epson' in queue_uri.lower():
        # Bypass colord ICC lookup on Epson ESC/P-R driver (eliminates 25-50s CUPS spool stall)
        opt_tokens.append('cm-calibration=true')

    pdf_is_landscape, is_mixed_orient = inspect_pdf_orientation_stats(effective_path)
    raw_orient = (orientation or 'auto').strip().lower()
    target_orient = raw_orient if raw_orient in ('landscape', 'portrait') else ('landscape' if pdf_is_landscape else 'portrait')

    # Prevent CUPS pdftopdf double-rotation while avoiding clipping mixed-orientation PDFs:
    if target_orient == 'landscape':
        if not pdf_is_landscape and not is_mixed_orient:
            opt_tokens.append('landscape')
    else:
        if pdf_is_landscape and not is_mixed_orient and raw_orient == 'portrait':
            opt_tokens.extend(['nopdfAutoRotate', 'portrait'])

    color_args = get_printer_color_flags(printer_name, color_mode)
    for tok in color_args:
        if tok != '-o':
            opt_tokens.append(tok)

    duplex_active = bool(is_duplex and printer_supports_duplex(printer_name))
    opt_tokens.append('sides=two-sided-long-edge' if duplex_active else 'sides=one-sided')

    formatted_ranges = _format_cups_page_ranges(page_range, total_pages=total_pages)
    if formatted_ranges:
        opt_tokens.append(f'page-ranges={formatted_ranges}')

    n_copies = max(1, int(copies or 1))
    try:
        # Multi-core 2-page batch pipeline for >=3 single-copy non-duplex pages (fast first-page start)
        if n_copies == 1 and not duplex_active:
            target_pages = _resolve_target_pages(effective_path, formatted_ranges, total_pages=total_pages)
            if len(target_pages) >= 3:
                batch_ranges = _group_pages_into_range_strings(target_pages, _PRESPOOL_BATCH_PAGES)
                if len(batch_ranges) >= 2 and _try_pipelined_batch_print(printer_name, effective_path, opt_tokens, batch_ranges):
                    return True

        prn_path, filter_tag, pre_sec = _prespool_escpr_to_ram(printer_name, effective_path, opt_tokens)
        if prn_path:
            prn_mb = os.path.getsize(prn_path) / (1024 * 1024)
            log(f"RAM Pre-Spool ready via {filter_tag} in {pre_sec:.2f}s ({prn_mb:.2f} MB) -> sending {n_copies} uninterrupted raw USB job(s)")
            try:
                for c_idx in range(1, n_copies + 1):
                    _submit_raw_prn_to_cups(printer_name, prn_path, f"{c_idx}/{n_copies}")
                return True
            finally:
                if os.path.exists(prn_path):
                    try:
                        os.remove(prn_path)
                    except Exception:
                        pass

        cmd = ['lp']
        if printer_name:
            cmd.extend(['-d', printer_name])
        if n_copies > 1:
            cmd.extend(['-n', str(n_copies)])
        for tok in opt_tokens:
            cmd.extend(['-o', tok])
        cmd.append(effective_path)

        log(f"Executing CUPS print: {' '.join(cmd)}")
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        log(f"CUPS Output: {res.stdout.strip()}")
        return True
    finally:
        if effective_path != file_path and os.path.exists(effective_path):
            try:
                os.remove(effective_path)
            except Exception:
                pass


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
_power_bad_streak = 0
_power_ok_streak = 0
_last_seen_printers = None


def evaluate_and_send_pi_health_alerts(pi_telem, printers):
    """Monitors Pi thermals, undervoltage, storage, RAM/swap, and USB printer connect/disconnect."""
    global _last_seen_printers, _power_bad_streak, _power_ok_streak

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

    # 2. Power / Active Undervoltage (strict hysteresis: at most 1 alert per 6h, no ping-pong recovery spam)
    if os.getenv("PI_VOLTAGE_ALERTS", "true").lower() == "true":
        if pi_telem.get("undervoltage_now") or pi_telem.get("throttled_now"):
            _power_bad_streak += 1
            _power_ok_streak = 0
            if _power_bad_streak >= 3 and not _active_alert_flags["power"]:
                _active_alert_flags["power"] = True
                send_wa_admin_alert(
                    "pi_undervoltage",
                    "warn",
                    "Pi Undervoltage / CPU Throttling",
                    "Raspberry Pi voltage dropped below 4.63V during load (CPU throttled to 600 MHz).\nUse a solid 5V 2.5A+ adapter & short thick Micro-USB cable (muted for 6h).",
                    cooldown_sec=21600,
                )
        else:
            _power_bad_streak = 0
            if _active_alert_flags["power"]:
                _power_ok_streak += 1
                if _power_ok_streak >= 20:
                    _active_alert_flags["power"] = False
                    _power_ok_streak = 0

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
    """Moves printed spool file to USB archive only after active USB print jobs finish (prevents dwc_otg contention)."""
    def _worker():
        try:
            waited = 0
            while waited < 120:
                if get_cups_queue_count() == 0:
                    break
                time.sleep(2)
                waited += 2
            time.sleep(2)
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
                            total_pages=total_pages,
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
