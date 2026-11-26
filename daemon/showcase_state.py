#!/usr/bin/env python3
"""
Shared showcase, Wi-Fi, USB printer detection, and Cloudflare sync helpers
for PrintKurox Raspberry Pi daemons (`printer_daemon_linux.py` and `wifi_setup_portal.py`).
"""

import json
import os
import re
import shutil
import subprocess
import urllib.parse
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'station_config.json')
OVERRIDE_PATH = os.path.join(BASE_DIR, 'showcase_override.json')
SCAN_CACHE_PATH = os.path.join(BASE_DIR, 'wifi_scan_cache.json')
ENV_PATH = os.path.join(BASE_DIR, '.env')
BOT_ENV_PATH = os.path.join(BASE_DIR, 'whatsapp_bot', '.env')

AP_CON_NAME = 'PrintKurox-Setup'
AP_SSID = 'PrintKurox-Setup'
AP_PASS = '123456789'
AP_GATEWAY_IP = '10.42.0.1'
EPSON_USB_ID = '04b8:1188'


def load_env_into_dict() -> dict:
    """Reads .env values from daemon/.env and whatsapp_bot/.env without mutating."""
    vals = {}
    for path in (ENV_PATH, BOT_ENV_PATH):
        if not os.path.exists(path):
            continue
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                for raw in f:
                    line = raw.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k and k not in vals:
                        vals[k] = v
        except Exception:
            pass
    return vals


def write_json_atomic(path: str, data: dict) -> None:
    """Writes JSON atomically and preserves readable permissions for pi user."""
    tmp = f"{path}.tmp.{os.getpid()}"
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o664)
        if os.geteuid() == 0:
            shutil.chown(path, user='pi', group='pi')
    except Exception:
        pass


def load_base_station_config() -> dict:
    """Loads the permanent base station config (Hostel Block B)."""
    data = {
        'station_id': 'block_b',
        'station_name': 'Hostel Block B (Pare)',
        'room_info': 'Room 29, 1st Floor',
        'printer_name': 'EPSON L3210 Series',
        'auto_duplex': False,
        'poll_interval_seconds': 2,
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                raw = json.load(f)
                if isinstance(raw, dict):
                    data.update(raw)
        except Exception:
            pass
    return data


def load_showcase_override() -> dict:
    """Loads active showcase override if present and enabled."""
    if not os.path.exists(OVERRIDE_PATH):
        return {}
    try:
        with open(OVERRIDE_PATH, 'r', encoding='utf-8') as f:
            raw = json.load(f)
            if isinstance(raw, dict) and raw.get('active'):
                return raw
    except Exception:
        pass
    return {}


def load_effective_station() -> dict:
    """Returns effective station & printer config (showcase override over base config)."""
    base = load_base_station_config()
    over = load_showcase_override()
    if over:
        merged = dict(base)
        for key in ('station_id', 'station_name', 'station_token', 'printer_name', 'room_info', 'wifi_ssid'):
            if over.get(key):
                merged[key] = over[key]
        merged['is_showcase'] = True
        merged['showcase_meta'] = over
        return merged
    base['is_showcase'] = False
    return base


def save_showcase_override(data: dict) -> None:
    payload = dict(data)
    payload['active'] = True
    write_json_atomic(OVERRIDE_PATH, payload)


def clear_showcase_override() -> dict:
    prev = load_showcase_override()
    if os.path.exists(OVERRIDE_PATH):
        try:
            os.remove(OVERRIDE_PATH)
        except Exception:
            pass
    return prev


def _run(cmd: list, timeout: float = 8.0) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def _sudo_prefix() -> list:
    return [] if (hasattr(os, 'geteuid') and os.geteuid() == 0) else ['sudo', '-n']


def get_current_wifi_ssid() -> str:
    """Returns currently associated client Wi-Fi SSID (empty when disconnected or AP mode)."""
    try:
        res = _run(['nmcli', '-t', '-f', 'ACTIVE,SSID,MODE', 'dev', 'wifi'], timeout=4)
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                parts = line.split(':')
                if len(parts) >= 3 and parts[0] == 'yes' and parts[2].lower() != 'ap':
                    return parts[1].strip()
    except Exception:
        pass
    try:
        res = _run(['iwgetid', '-r'], timeout=2)
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return ''


def get_primary_ip() -> str:
    try:
        res = _run(['hostname', '-I'], timeout=2)
        if res.returncode == 0:
            for token in res.stdout.strip().split():
                if '.' in token and not token.startswith('127.') and not token.startswith('10.42.'):
                    return token
    except Exception:
        pass
    return ''


def is_ap_mode_active() -> bool:
    try:
        res = _run(['nmcli', '-t', '-f', 'NAME,DEVICE', 'con', 'show', '--active'], timeout=4)
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                if line.startswith(f'{AP_CON_NAME}:'):
                    return True
    except Exception:
        pass
    return False


def has_internet(timeout: float = 3.0) -> bool:
    try:
        resp = requests.get('http://connectivitycheck.gstatic.com/generate_204', timeout=timeout, allow_redirects=False)
        return resp.status_code in (200, 204)
    except Exception:
        return False


def is_epson_l3210_connected() -> bool:
    """True when the Hostel Block B EPSON L3210 USB printer is physically attached."""
    try:
        res = _run(['lsusb'], timeout=3)
        if res.returncode == 0 and (EPSON_USB_ID in res.stdout.lower() or 'l3210' in res.stdout.lower()):
            return True
    except Exception:
        pass
    for item in list_physical_usb_printers():
        if item.get('is_epson_l3210'):
            return True
    return False


def _human_label_from_uri(uri: str) -> str:
    clean = uri
    for prefix in ('usb://', 'hp:/usb/', 'ipp://', 'ipps://'):
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
            break
    clean = clean.split('?')[0]
    clean = urllib.parse.unquote(clean).replace('/', ' ').replace('_', ' ').strip()
    return clean or uri


def list_physical_usb_printers() -> list:
    """Lists printers physically detected right now via lpinfo -v."""
    printers = []
    seen_uris = set()
    try:
        cmd = _sudo_prefix() + ['lpinfo', '-v']
        res = _run(cmd, timeout=8)
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                parts = line.strip().split(None, 1)
                if len(parts) != 2:
                    continue
                kind, uri = parts[0].lower(), parts[1].strip()
                if kind == 'direct' and (uri.startswith('usb://') or uri.startswith('hp:/usb/')):
                    if uri in seen_uris:
                        continue
                    seen_uris.add(uri)
                    label = _human_label_from_uri(uri)
                    printers.append({
                        'uri': uri,
                        'label': label,
                        'is_epson_l3210': 'epson' in uri.lower() and 'l3210' in uri.lower(),
                    })
    except Exception:
        pass
    return printers


def get_cups_queue_uris() -> dict:
    """Returns {cups_queue_name: device_uri} from lpstat -v."""
    mapping = {}
    try:
        res = _run(['lpstat', '-v'], timeout=4)
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                m = re.match(r'^device for\s+(\S+):\s+(.+)$', line.strip())
                if m:
                    mapping[m.group(1)] = m.group(2).strip()
    except Exception:
        pass
    return mapping


def _norm_alnum(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def is_cups_loopback_alias(queue_name: str, uri: str) -> bool:
    """True for CUPS self-advertised loopback/Avahi aliases like EPSON_L3210_Series_printkurox_pi."""
    q_low = (queue_name or '').lower()
    u_low = (uri or '').lower()
    if '_printkurox_pi' in q_low:
        return True
    if ('localhost:631/printers/' in u_low or '127.0.0.1:631/printers/' in u_low):
        return True
    return False


def _lsusb_mentions_vendor(uri_low: str) -> bool:
    """Fallback hardware check via lsusb when lpinfo -v is momentarily busy during an active USB print."""
    try:
        res = _run(['lsusb'], timeout=3)
        if res.returncode != 0 or not res.stdout:
            return False
        ls_low = res.stdout.lower()
        if 'epson' in uri_low and 'l3210' in uri_low:
            return (EPSON_USB_ID in ls_low) or ('l3210' in ls_low) or ('seiko epson' in ls_low)
        for vendor in ('epson', 'canon', 'brother', 'hewlett-packard', 'hp ', 'xerox', 'samsung', 'ricoh'):
            if vendor.strip() in uri_low and vendor.strip() in ls_low:
                return True
    except Exception:
        pass
    return False


def is_cups_queue_physically_present(queue_name: str, queue_uris: dict, physical_printers: list) -> bool:
    """Checks whether a configured CUPS queue points to a currently plugged-in physical device."""
    uri = (queue_uris or {}).get(queue_name, '')
    if is_cups_loopback_alias(queue_name, uri):
        return False
    if not uri:
        return True
    low = uri.lower()
    if low.startswith('usb://') or low.startswith('hp:/usb/'):
        phys_uris = [p['uri'] for p in physical_printers]
        if uri in phys_uris:
            return True
        uri_base = _norm_alnum(urllib.parse.unquote(uri.split('?')[0]))
        for pu in phys_uris:
            if uri_base and uri_base == _norm_alnum(urllib.parse.unquote(pu.split('?')[0])):
                return True
        return _lsusb_mentions_vendor(low)
    return True


def sanitize_cups_queue_name(custom_name: str, fallback: str = 'PrintKurox_Custom_Printer') -> str:
    cleaned = re.sub(r'[^A-Za-z0-9_-]+', '_', (custom_name or '').strip()).strip('_-')
    return (cleaned[:48] or fallback)


def _find_matching_ppd(printer_label: str) -> str:
    """Finds best PPD via lpinfo -m when -m everywhere isn't supported by an older USB printer."""
    tokens = [t.lower() for t in re.findall(r'[A-Za-z0-9]{2,}', printer_label or '') if t.lower() not in ('series', 'usb', 'printer')]
    if not tokens:
        return ''
    try:
        res = _run(_sudo_prefix() + ['lpinfo', '-m'], timeout=12)
        if res.returncode != 0:
            return ''
        best_model = ''
        best_score = 0
        for line in res.stdout.splitlines():
            parts = line.strip().split(None, 1)
            if len(parts) != 2:
                continue
            ppd_id, desc = parts[0], parts[1].lower()
            if ppd_id in ('everywhere', 'raw'):
                continue
            score = sum(2 if tok in desc else 0 for tok in tokens)
            if tokens and tokens[0] in desc:
                score += 3
            if 'gutenprint' in ppd_id or 'hpcups' in ppd_id or 'drv://' in ppd_id:
                score += 1
            if score > best_score:
                best_score = score
                best_model = ppd_id
        return best_model if best_score >= 3 else ''
    except Exception:
        return ''


def provision_usb_printer(custom_name: str, usb_uri: str, label_hint: str = '') -> tuple[bool, str, str]:
    """
    Creates or re-enables a CUPS queue bound to `usb_uri` with sanitized `custom_name`.
    Returns (ok, queue_name_or_error, detail_message).
    """
    if not usb_uri:
        return False, '', 'No USB printer URI supplied.'
    queue_name = sanitize_cups_queue_name(custom_name or _human_label_from_uri(usb_uri))
    sudo = _sudo_prefix()

    # Reuse matching queue name if already bound to the exact same URI
    existing_uris = get_cups_queue_uris()
    if existing_uris.get(queue_name) == usb_uri:
        _run(sudo + ['cupsaccept', queue_name], timeout=4)
        _run(sudo + ['cupsenable', queue_name], timeout=4)
        return True, queue_name, f'Reused existing CUPS queue {queue_name}'

    # Try driverless IPP Everywhere first, then matched vendor PPD, then raw/generic fallback
    models_to_try = ['everywhere']
    matched_ppd = _find_matching_ppd(label_hint or _human_label_from_uri(usb_uri))
    if matched_ppd:
        models_to_try.append(matched_ppd)

    last_err = ''
    for model in models_to_try:
        res = _run(sudo + ['lpadmin', '-p', queue_name, '-E', '-v', usb_uri, '-m', model], timeout=12)
        if res.returncode == 0:
            if 'epson' in usb_uri.lower():
                _run(sudo + ['lpadmin', '-p', queue_name, '-o', 'usb-unidir-default=true', '-o', 'usb-no-reattach-default=true'], timeout=4)
            _run(sudo + ['cupsaccept', queue_name], timeout=4)
            _run(sudo + ['cupsenable', queue_name], timeout=4)
            return True, queue_name, f'Provisioned {queue_name} with driver {model}'
        last_err = (res.stderr or res.stdout or '').strip()

    return False, queue_name, f'Failed to bind CUPS queue ({last_err or "no matching driver"})'


def create_or_sync_station(
    server_url: str,
    station_name: str,
    admin_pin: str = '1234',
    is_public: bool = True,
    whatsapp_number: str = '+919362980761',
    duplex_enabled: bool = True,
) -> dict:
    """Creates or updates a custom station in Cloudflare D1 via /api/station/list POST."""
    url = f"{server_url.rstrip('/')}/api/station/list"
    clean_name = (station_name or 'Hackathon Demo Printer').strip()
    short_code = re.sub(r'[^A-Za-z0-9]+', '_', clean_name).strip('_').upper()[:12] or 'DEMO'
    payload = {
        'name': clean_name,
        'shortName': short_code,
        'stationType': 'event',
        'whatsappNumber': whatsapp_number,
        'adminPin': (admin_pin or '1234').strip(),
        'isPublic': 1 if is_public else 0,
        'duplexEnabled': 1 if duplex_enabled else 0,
    }
    resp = requests.post(url, json=payload, timeout=12)
    data = resp.json()
    if resp.status_code != 200 or not data.get('success'):
        raise RuntimeError(data.get('error') or f'HTTP {resp.status_code} creating station')
    return data


def mark_station_offline_d1(station_id: str) -> None:
    """Marks a temporary showcase station offline in D1 immediately when returning to Block B."""
    if not station_id or station_id.lower() in ('block_b', 'main', 'hostel_block_b_pare', 'pare'):
        return
    env = load_env_into_dict()
    acct = env.get('CLOUDFLARE_ACCOUNT_ID', '')
    token = env.get('CLOUDFLARE_API_TOKEN', '')
    db_id = env.get('CLOUDFLARE_D1_DATABASE_ID', '')
    if not (acct and token and db_id):
        return
    endpoint = f"https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{db_id}/query"
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    for sql in (
        "UPDATE stations SET status = 'offline', last_heartbeat = NULL WHERE id = ?",
        "DELETE FROM daemon_heartbeat WHERE station_id = ?",
    ):
        try:
            requests.post(endpoint, headers=headers, json={'sql': sql, 'params': [station_id]}, timeout=6)
        except Exception:
            pass


def send_local_admin_alert(alert_key: str, severity: str, title: str, body: str, cooldown_ms: int = 1000) -> bool:
    """Sends a WhatsApp alert via local whatsapp_bot internal server (127.0.0.1:7261)."""
    env = load_env_into_dict()
    headers = {'Content-Type': 'application/json'}
    if env.get('STATION_TOKEN'):
        headers['X-Station-Token'] = env['STATION_TOKEN']
    try:
        r = requests.post(
            'http://127.0.0.1:7261/internal/admin-alert',
            headers=headers,
            json={
                'alertKey': alert_key,
                'severity': severity,
                'title': title,
                'body': body,
                'cooldownMs': cooldown_ms,
            },
            timeout=4,
        )
        return r.status_code == 200
    except Exception:
        return False
