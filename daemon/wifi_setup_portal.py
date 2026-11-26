#!/usr/bin/env python3
"""
PrintKurox Offline Wi-Fi & Custom Printer Setup Portal (Raspberry Pi 3B+)
==========================================================================
- On boot: waits up to ~35s for saved Wi-Fi (e.g. BLOCK-B / pre-saved hotspot),
  Ethernet, or Android USB Tethering.
- If no internet is available: scans live nearby Wi-Fi/hotspots, launches an
  offline AP (`PrintKurox-Setup`, password `123456789`) on 10.42.0.1, and serves
  an offline captive setup dashboard to connect any hotspot & custom USB printer.
- Automatically syncs a new custom station in Cloudflare D1 once connected, rolls
  back to AP mode within 25s if Wi-Fi credentials fail, and auto-returns to
  Hostel Block B (`block_b` + `EPSON_L3210_Series`) when BOTH `BLOCK-B` Wi-Fi
  and the `EPSON L3210` USB printer are detected together.
"""

import html
import json
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

import showcase_state as ss

LOCAL_CONTROL_PORT = 7255
PORTAL_HTTP_PORT = 80
CAPTIVE_DNS_CONF = '/etc/NetworkManager/dnsmasq-shared.d/printkurox-captive.conf'
BOOT_GRACE_SECONDS = 35
RUNTIME_OFFLINE_THRESHOLD_SECONDS = 120

_state_lock = threading.Lock()
_ap_active = False
_portal_server = None
_cached_wifi_networks = []
_last_error_banner = ''
_last_status_message = ''
_connect_busy = False
_scan_busy = False


def log(msg: str) -> None:
    print(f"[SetupPortal {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def run_cmd(cmd: list, timeout: float = 10.0) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def sudo_cmd(cmd: list, timeout: float = 10.0) -> subprocess.CompletedProcess:
    prefix = [] if (hasattr(os, 'geteuid') and os.geteuid() == 0) else ['sudo', '-n']
    return run_cmd(prefix + cmd, timeout=timeout)


def scan_nearby_wifi() -> list:
    """Scans real-time nearby Wi-Fi/hotspots using nmcli (safe when not in AP mode)."""
    networks = {}
    try:
        res = sudo_cmd(['nmcli', '-t', '-f', 'SSID,SIGNAL,SECURITY,BARS', 'dev', 'wifi', 'list', '--rescan', 'yes'], timeout=12)
        if res.returncode == 0:
            for raw in res.stdout.splitlines():
                if not raw.strip():
                    continue
                # Split escaped colons safely
                parts = re.split(r'(?<!\\):', raw)
                if len(parts) < 2:
                    continue
                ssid = parts[0].replace('\\:', ':').strip()
                if not ssid or ssid == ss.AP_SSID:
                    continue
                try:
                    signal = int(parts[1])
                except ValueError:
                    signal = 0
                sec = (parts[2].replace('\\:', ':').strip() if len(parts) > 2 else '') or 'Open'
                if ssid not in networks or signal > networks[ssid]['signal']:
                    networks[ssid] = {'ssid': ssid, 'signal': signal, 'security': sec}
    except Exception as e:
        log(f"Wi-Fi scan error: {e}")

    items = sorted(networks.values(), key=lambda x: x['signal'], reverse=True)
    if items:
        try:
            ss.write_json_atomic(ss.SCAN_CACHE_PATH, {'updatedAt': time.time(), 'networks': items})
        except Exception:
            pass
    return items


def load_cached_wifi() -> list:
    if _cached_wifi_networks:
        return _cached_wifi_networks
    if os.path.exists(ss.SCAN_CACHE_PATH):
        try:
            with open(ss.SCAN_CACHE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('networks', [])
        except Exception:
            pass
    return []


def _write_captive_dns(enabled: bool) -> None:
    try:
        if enabled:
            os.makedirs(os.path.dirname(CAPTIVE_DNS_CONF), exist_ok=True)
            with open(CAPTIVE_DNS_CONF, 'w', encoding='utf-8') as f:
                f.write(f"address=/#/{ss.AP_GATEWAY_IP}\n")
        else:
            if os.path.exists(CAPTIVE_DNS_CONF):
                os.remove(CAPTIVE_DNS_CONF)
    except Exception as e:
        log(f"Captive DNS conf warning: {e}")


def start_ap_mode(rescan_first: bool = True) -> bool:
    """Starts `PrintKurox-Setup` Wi-Fi AP on wlan0 with DHCP + captive portal HTTP UI."""
    global _ap_active, _cached_wifi_networks
    with _state_lock:
        if rescan_first:
            # Ensure AP isn't holding wlan0 while rescanning
            sudo_cmd(['nmcli', 'connection', 'down', ss.AP_CON_NAME], timeout=8)
            time.sleep(1.0)
            scanned = scan_nearby_wifi()
            if scanned:
                _cached_wifi_networks = scanned

        _write_captive_dns(True)
        sudo_cmd(['nmcli', 'connection', 'delete', ss.AP_CON_NAME], timeout=6)
        res = sudo_cmd([
            'nmcli', 'device', 'wifi', 'hotspot',
            'ifname', 'wlan0',
            'con-name', ss.AP_CON_NAME,
            'ssid', ss.AP_SSID,
            'password', ss.AP_PASS,
        ], timeout=15)
        if res.returncode != 0:
            log(f"Failed to start AP hotspot: {res.stderr.strip()}")
            _write_captive_dns(False)
            _ap_active = False
            return False

        _ap_active = True
        log(f"AP Mode ACTIVE: SSID='{ss.AP_SSID}' Pass='{ss.AP_PASS}' Portal=http://{ss.AP_GATEWAY_IP}")
        ensure_portal_http_server()
        return True


def stop_ap_mode() -> None:
    global _ap_active
    with _state_lock:
        sudo_cmd(['nmcli', 'connection', 'down', ss.AP_CON_NAME], timeout=8)
        sudo_cmd(['nmcli', 'connection', 'delete', ss.AP_CON_NAME], timeout=6)
        _write_captive_dns(False)
        _ap_active = False
        log("AP Mode stopped.")


def restart_print_services() -> None:
    sudo_cmd(['systemctl', 'restart', 'printkurox'], timeout=12)
    sudo_cmd(['systemctl', 'restart', 'printkurox-bot'], timeout=12)


def notify_bot_when_ready(title: str, body: str, alert_key: str) -> None:
    def _worker():
        for _ in range(25):
            if ss.send_local_admin_alert(alert_key, 'recovery', title, body, cooldown_ms=500):
                log(f"WhatsApp notification delivered: {alert_key}")
                return
            time.sleep(2.0)
        log(f"WhatsApp notification skipped (bot offline): {alert_key}")
    threading.Thread(target=_worker, daemon=True).start()


def switch_back_to_hostel(reason: str = 'Auto-return: BLOCK-B Wi-Fi & EPSON L3210 detected') -> dict:
    """Clears showcase override, marks old showcase station offline, and restores block_b."""
    prev = ss.clear_showcase_override()
    old_station = prev.get('station_id', '')
    if old_station:
        ss.mark_station_offline_d1(old_station)
    stop_ap_mode()
    restart_print_services()
    log(f"Switched back to Hostel Mode (block_b / EPSON_L3210_Series): {reason}")
    notify_bot_when_ready(
        'Hostel Mode Restored (block_b)',
        f"Reason: {reason}\n• Active Station: Hostel Block B (Pare) (`block_b`)\n• Active Printer: `EPSON_L3210_Series`\n• Previous showcase station `{old_station or 'none'}` set offline.",
        'showcase_return_hostel',
    )
    return {'ok': True, 'previous_station': old_station}


def _connect_and_activate_worker(payload: dict) -> None:
    global _connect_busy, _last_error_banner, _last_status_message
    ssid = (payload.get('ssid') or '').strip()
    password = (payload.get('password') or '').strip()
    save_priority = 30 if payload.get('remember_wifi') else 12
    usb_uri = (payload.get('usb_uri') or '').strip()
    custom_printer = (payload.get('custom_printer_name') or '').strip()
    station_name = (payload.get('station_name') or '').strip() or 'Hackathon Print Booth'
    admin_pin = (payload.get('admin_pin') or '1234').strip()
    is_public = bool(payload.get('is_public', True))

    try:
        _last_error_banner = ''
        _last_status_message = f"Connecting to '{ssid}'..."

        # 1. Bind custom USB printer before switching off AP so CUPS queue is ready
        bound_queue = ''
        if usb_uri:
            ok_p, queue_name, msg_p = ss.provision_usb_printer(custom_printer or station_name, usb_uri)
            log(msg_p)
            if ok_p:
                bound_queue = queue_name

        # 2. Tear down setup AP and attempt Wi-Fi client connection
        stop_ap_mode()
        time.sleep(1.5)

        con_name = f"PK-{re.sub(r'[^A-Za-z0-9_-]+', '_', ssid)[:24]}"
        sudo_cmd(['nmcli', 'connection', 'delete', con_name], timeout=6)

        if password:
            res = sudo_cmd([
                'nmcli', 'device', 'wifi', 'connect', ssid,
                'password', password,
                'ifname', 'wlan0',
                'name', con_name,
            ], timeout=25)
        else:
            res = sudo_cmd([
                'nmcli', 'device', 'wifi', 'connect', ssid,
                'ifname', 'wlan0',
                'name', con_name,
            ], timeout=25)

        if res.returncode == 0:
            sudo_cmd(['nmcli', 'connection', 'modify', con_name, 'connection.autoconnect-priority', str(save_priority)], timeout=5)

        # 3. Verify real internet within 25s (fail-safe rollback to AP mode!)
        online = False
        for _ in range(12):
            if ss.has_internet(timeout=2.5):
                online = True
                break
            time.sleep(2.0)

        if not online:
            sudo_cmd(['nmcli', 'connection', 'delete', con_name], timeout=6)
            _last_error_banner = (
                f"Could not connect to '{ssid}' with internet access. "
                "Check Wi-Fi password or enable 2.4 GHz (Maximize Compatibility) on your phone hotspot."
            )
            log(_last_error_banner)
            start_ap_mode(rescan_first=False)
            return

        # 4. Connected! Register/update custom station in Cloudflare D1
        env = ss.load_env_into_dict()
        server_url = env.get('SERVER_URL', env.get('PUBLIC_KIOSK_URL', 'https://printkurox.pages.dev')).rstrip('/')
        admin_phone = env.get('ADMIN_PHONE', '9863013886').strip()
        wa_num = admin_phone if admin_phone.startswith('+') else f"+91{admin_phone}"

        created = ss.create_or_sync_station(
            server_url=server_url,
            station_name=station_name,
            admin_pin=admin_pin,
            is_public=is_public,
            whatsapp_number=wa_num,
        )
        station_id = created['station_id']
        station_token = created.get('station_token', '')

        ss.save_showcase_override({
            'active': True,
            'station_id': station_id,
            'station_name': station_name,
            'station_token': station_token,
            'printer_name': bound_queue,
            'usb_uri': usb_uri,
            'wifi_ssid': ssid,
            'admin_pin': admin_pin,
            'is_public': is_public,
            'created_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        })

        log(f"Showcase active: station={station_id}, printer={bound_queue or 'auto'}, wifi={ssid}")
        restart_print_services()

        ip_addr = ss.get_primary_ip() or 'unknown'
        station_url = f"{server_url}/?station={station_id}"
        admin_url = f"{server_url}/admin/{station_id}?token={station_token}"
        notify_bot_when_ready(
            'Showcase Station Live',
            (
                f"Wi-Fi: *{ssid}* | SSH IP: `{ip_addr}`\n"
                f"• Station: *{station_name}* (`{station_id}`)\n"
                f"• Printer: `{bound_queue or 'Auto USB'}`\n"
                f"• Pricing: Normal (₹4 B&W / ₹7 Color)\n\n"
                f"🌐 Customer Link:\n{station_url}\n\n"
                f"⚙️ Admin & Price Editor:\n{admin_url}\n\n"
                "_Will auto-return to `block_b` when BLOCK-B + EPSON L3210 are connected together, or reply `#resethostel`._"
            ),
            f"showcase_live_{station_id}",
        )
        _last_status_message = f"Live on {ssid} ({station_id})"
    except Exception as exc:
        _last_error_banner = f"Setup error: {exc}"
        log(_last_error_banner)
        start_ap_mode(rescan_first=False)
    finally:
        _connect_busy = False


def render_portal_html() -> str:
    networks = load_cached_wifi()
    printers = ss.list_physical_usb_printers()
    override = ss.load_showcase_override()
    err_html = f'<div class="alert err">{html.escape(_last_error_banner)}</div>' if _last_error_banner else ''
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PrintKurox Offline Setup</title>
<style>
  body{{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:16px}}
  .wrap{{max-width:520px;margin:0 auto}}
  .card{{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:18px;margin-bottom:14px}}
  h1{{margin:0 0 6px;font-size:20px;color:#fff}}
  h2{{margin:0 0 10px;font-size:15px;color:#38bdf8;text-transform:uppercase;letter-spacing:.04em}}
  p.sub{{margin:0 0 14px;color:#94a3b8;font-size:13px}}
  .net-list{{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;max-height:240px;overflow:auto}}
  .net{{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;border:1px solid #334155;background:#0f172a;cursor:pointer}}
  .net.sel{{border-color:#38bdf8;background:#082f49}}
  .badge{{font-size:11px;padding:3px 8px;border-radius:999px;background:#334155;color:#cbd5e1}}
  label{{display:block;font-size:12px;color:#94a3b8;margin:10px 0 4px}}
  input,select{{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;font-size:14px}}
  .row{{display:flex;gap:8px;align-items:center;margin-top:8px}}
  .row input[type=checkbox]{{width:auto}}
  button{{width:100%;padding:12px;border:0;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;margin-top:10px}}
  .btn-primary{{background:#0284c7;color:#fff}}
  .btn-sec{{background:#334155;color:#e2e8f0}}
  .btn-warn{{background:#b45309;color:#fff}}
  .alert{{padding:12px;border-radius:10px;margin-bottom:12px;font-size:13px}}
  .err{{background:#7f1d1d;border:1px solid #ef4444;color:#fecaca}}
  .ok{{background:#064e3b;border:1px solid #10b981;color:#d1fae5}}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>PrintKurox Pi Portable Setup</h1>
    <p class="sub">Offline setup hotspot &bull; Gateway <code>10.42.0.1</code></p>
    {err_html}
    <div id="statusBox" style="display:none" class="alert ok"></div>
  </div>

  <div class="card">
    <h2>1. Select Wi-Fi / Phone Hotspot</h2>
    <div class="net-list" id="netList"></div>
    <button type="button" class="btn-sec" onclick="rescanWifi()">Rescan Nearby Wi-Fi (4s)</button>
    <label>Selected or Hidden Wi-Fi SSID</label>
    <input id="ssid" placeholder="Tap a Wi-Fi above or type SSID">
    <label>Wi-Fi Password (leave blank if Open)</label>
    <input id="password" type="password" placeholder="Hotspot / Router password">
    <div class="row">
      <input id="remember" type="checkbox" checked>
      <label for="remember" style="margin:0;color:#cbd5e1">Save hotspot priority on Pi for next reboot</label>
    </div>
  </div>

  <div class="card">
    <h2>2. USB Printer & Custom Station Name</h2>
    <label>Detected Plugged-In USB Printer</label>
    <select id="usbUri"></select>
    <button type="button" class="btn-sec" onclick="refreshPrinters()">Refresh Plugged USB Printers</button>
    <label>Custom Printer Queue Name</label>
    <input id="printerName" placeholder="e.g. Stage_HP_Printer" value="{html.escape(override.get('printer_name',''))}">
    <label>Custom Station Name (shown on website &amp; QR)</label>
    <input id="stationName" placeholder="e.g. Hackathon Demo Booth" value="{html.escape(override.get('station_name','Hackathon Print Booth'))}">
    <label>Station Admin PIN (for /admin price edits)</label>
    <input id="adminPin" value="{html.escape(override.get('admin_pin','1234'))}">
    <div class="row">
      <input id="isPublic" type="checkbox" checked>
      <label for="isPublic" style="margin:0;color:#cbd5e1">Show on website station list (₹4 B&amp;W / ₹7 Color default)</label>
    </div>
    <button type="button" class="btn-primary" onclick="connectAndLaunch()">Connect &amp; Launch PrintKurox</button>
    {'<button type="button" class="btn-warn" onclick="resetHostel()">Switch Back to Hostel Mode (block_b)</button>' if override else ''}
  </div>
</div>

<script>
const INIT_NETS = {json.dumps(networks)};
const INIT_PRINTERS = {json.dumps(printers)};

function renderNets(list) {{
  const box = document.getElementById('netList');
  if (!list || !list.length) {{
    box.innerHTML = '<div style="color:#94a3b8;font-size:13px">No Wi-Fi networks cached yet. Click Rescan Nearby Wi-Fi.</div>';
    return;
  }}
  box.innerHTML = list.map(n => `
    <div class="net" onclick="pickSsid(this, '${{n.ssid.replace(/'/g, "\\\\'")}}')">
      <span><strong>${{esc(n.ssid)}}</strong><br><small style="color:#94a3b8">${{esc(n.security)}}</small></span>
      <span class="badge">${{n.signal}}%</span>
    </div>`).join('');
}}

function renderPrinters(list) {{
  const sel = document.getElementById('usbUri');
  if (!list || !list.length) {{
    sel.innerHTML = '<option value="">No USB printer detected yet (plug USB & click Refresh)</option>';
    return;
  }}
  sel.innerHTML = list.map(p => `<option value="${{esc(p.uri)}}">${{esc(p.label)}}${{p.is_epson_l3210 ? ' (Block B Epson)' : ''}}</option>`).join('');
  const pn = document.getElementById('printerName');
  if (!pn.value && list[0]) {{
    pn.value = list[0].label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  }}
}}

function esc(s) {{ return String(s||'').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c])); }}
function pickSsid(el, ssid) {{
  document.querySelectorAll('.net').forEach(x => x.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('ssid').value = ssid;
}}
function showStatus(msg) {{
  const b = document.getElementById('statusBox');
  b.style.display = 'block';
  b.textContent = msg;
}}

async function refreshPrinters() {{
  const r = await fetch('/api/printers');
  const d = await r.json();
  renderPrinters(d.printers || []);
}}

async function rescanWifi() {{
  showStatus('Pausing hotspot for ~5s to scan real-time Wi-Fi... Reconnect to PrintKurox-Setup if disconnected.');
  try {{ await fetch('/api/rescan', {{method:'POST'}}); }} catch(e) {{}}
  setTimeout(async () => {{
    try {{
      const r = await fetch('/api/networks');
      const d = await r.json();
      renderNets(d.networks || []);
      showStatus('Nearby Wi-Fi list refreshed!');
    }} catch(e) {{
      showStatus('Reconnect your phone to PrintKurox-Setup and reload 10.42.0.1 to view refreshed scan.');
    }}
  }}, 7000);
}}

async function connectAndLaunch() {{
  const ssid = document.getElementById('ssid').value.trim();
  if (!ssid) return alert('Select or enter a Wi-Fi SSID first.');
  const payload = {{
    ssid,
    password: document.getElementById('password').value,
    remember_wifi: document.getElementById('remember').checked,
    usb_uri: document.getElementById('usbUri').value,
    custom_printer_name: document.getElementById('printerName').value.trim(),
    station_name: document.getElementById('stationName').value.trim(),
    admin_pin: document.getElementById('adminPin').value.trim() || '1234',
    is_public: document.getElementById('isPublic').checked,
  }};
  showStatus('Connecting Pi to "' + ssid + '" & creating station... Watch your WhatsApp in ~15-25s (if password is wrong, PrintKurox-Setup will reopen automatically).');
  await fetch('/api/connect', {{method:'POST', headers:{{'Content-Type':'application/json'}}, body:JSON.stringify(payload)}});
}}

async function resetHostel() {{
  showStatus('Switching back to Hostel Block B...');
  await fetch('/api/reset-hostel', {{method:'POST'}});
}}

renderNets(INIT_NETS);
renderPrinters(INIT_PRINTERS);
</script>
</body>
</html>"""


class PortalHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_json(self, code: int, obj: dict) -> None:
        raw = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def _send_redirect_portal(self) -> None:
        self.send_response(302)
        self.send_header('Location', f'http://{ss.AP_GATEWAY_IP}/')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def do_GET(self):
        global _cached_wifi_networks
        path = self.path.split('?')[0]
        if path in ('/generate_204', '/gen_204', '/hotspot-detect.html', '/library/test/success.html', '/connecttest.txt', '/ncsi.txt', '/redirect'):
            self._send_redirect_portal()
            return
        if path == '/api/printers':
            self._send_json(200, {'printers': ss.list_physical_usb_printers()})
            return
        if path == '/api/networks':
            self._send_json(200, {'networks': load_cached_wifi()})
            return
        if path == '/' or path == '/setup':
            body = render_portal_html().encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        self._send_redirect_portal()

    def do_POST(self):
        global _connect_busy, _scan_busy, _cached_wifi_networks
        path = self.path.split('?')[0]
        length = min(65536, int(self.headers.get('Content-Length') or 0))
        raw = self.rfile.read(length).decode('utf-8', errors='ignore') if length > 0 else '{}'
        try:
            data = json.loads(raw) if raw.strip().startswith('{') else {k: v[0] for k, v in parse_qs(raw).items()}
        except Exception:
            data = {}

        if path == '/api/rescan':
            if not _scan_busy:
                _scan_busy = True
                def _rescan():
                    global _scan_busy, _cached_wifi_networks
                    try:
                        stop_ap_mode()
                        time.sleep(1.5)
                        scanned = scan_nearby_wifi()
                        if scanned:
                            _cached_wifi_networks = scanned
                    finally:
                        start_ap_mode(rescan_first=False)
                        _scan_busy = False
                threading.Thread(target=_rescan, daemon=True).start()
            self._send_json(200, {'ok': True, 'scanning': True})
            return

        if path == '/api/connect':
            if _connect_busy:
                self._send_json(409, {'ok': False, 'error': 'Connection already in progress'})
                return
            _connect_busy = True
            self._send_json(200, {'ok': True, 'connecting': True})
            threading.Thread(target=_connect_and_activate_worker, args=(data,), daemon=True).start()
            return

        if path == '/api/reset-hostel':
            self._send_json(200, {'ok': True})
            threading.Thread(target=switch_back_to_hostel, args=('Manual reset from offline portal',), daemon=True).start()
            return

        self._send_json(404, {'error': 'Not found'})


def ensure_portal_http_server() -> None:
    global _portal_server
    if _portal_server is not None:
        return
    try:
        _portal_server = ThreadingHTTPServer(('0.0.0.0', PORTAL_HTTP_PORT), PortalHandler)
        threading.Thread(target=_portal_server.serve_forever, daemon=True).start()
        log(f"Offline Portal HTTP UI listening on port {PORTAL_HTTP_PORT}")
    except Exception as e:
        log(f"Portal HTTP port {PORTAL_HTTP_PORT} warning: {e}")


class LocalControlHandler(BaseHTTPRequestHandler):
    """Internal control API on 127.0.0.1:7255 for WhatsApp #apmode / #resethostel."""
    def log_message(self, format, *args):
        pass

    def _reply(self, code: int, obj: dict) -> None:
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode('utf-8'))

    def do_GET(self):
        if self.path.startswith('/health'):
            self._reply(200, {'ok': True, 'ap_active': _ap_active, 'ssid': ss.get_current_wifi_ssid()})
            return
        self._reply(404, {'error': 'not found'})

    def do_POST(self):
        if self.path.startswith('/apmode'):
            self._reply(200, {'ok': True, 'ap_ssid': ss.AP_SSID})
            threading.Thread(target=start_ap_mode, kwargs={'rescan_first': True}, daemon=True).start()
            return
        if self.path.startswith('/reset-hostel'):
            self._reply(200, {'ok': True})
            threading.Thread(target=switch_back_to_hostel, args=('WhatsApp admin #resethostel',), daemon=True).start()
            return
        self._reply(404, {'error': 'not found'})


def start_local_control_server() -> None:
    srv = ThreadingHTTPServer(('127.0.0.1', LOCAL_CONTROL_PORT), LocalControlHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    log(f"Local control server listening on http://127.0.0.1:{LOCAL_CONTROL_PORT}")


def main() -> None:
    start_local_control_server()
    log("Boot check: waiting for saved Wi-Fi / Ethernet / USB tether...")

    # Clean up any leftover captive DNS file on clean boot
    _write_captive_dns(False)

    boot_online = False
    deadline = time.monotonic() + BOOT_GRACE_SECONDS
    while time.monotonic() < deadline:
        if ss.has_internet(timeout=2.5):
            boot_online = True
            break
        time.sleep(3.0)

    if boot_online:
        ssid = ss.get_current_wifi_ssid() or 'Ethernet/USB'
        log(f"Online at boot via '{ssid}' ({ss.get_primary_ip()}). Setup AP not needed.")
    else:
        log("No internet detected after boot grace window; launching PrintKurox-Setup AP...")
        start_ap_mode(rescan_first=True)

    # Background loop:
    # 1) Dual-sensor auto-return to Hostel Mode (BLOCK-B + EPSON L3210 connected together)
    # 2) Auto-open AP if completely offline outside BLOCK-B for >120s
    return_confirm_count = 0
    offline_since = None

    while True:
        time.sleep(15.0)
        try:
            if _connect_busy or _scan_busy:
                continue

            cur_ssid = ss.get_current_wifi_ssid()
            over = ss.load_showcase_override()

            # 1. Dual-sensor Auto-Return to Hostel Mode
            if over and cur_ssid == 'BLOCK-B' and ss.is_epson_l3210_connected():
                return_confirm_count += 1
                if return_confirm_count >= 2:
                    return_confirm_count = 0
                    switch_back_to_hostel('Auto-return: BLOCK-B Wi-Fi + EPSON L3210 USB connected')
                    continue
            else:
                return_confirm_count = 0

            # 2. Offline AP safety fallback (never drops active BLOCK-B / captive renewals quickly)
            if _ap_active:
                offline_since = None
                continue

            if ss.has_internet(timeout=2.5):
                offline_since = None
            elif cur_ssid == 'BLOCK-B':
                # Let campus_wifi_portal handle captive portal logins
                offline_since = None
            else:
                if offline_since is None:
                    offline_since = time.monotonic()
                elif (time.monotonic() - offline_since) >= RUNTIME_OFFLINE_THRESHOLD_SECONDS:
                    offline_since = None
                    log("Offline >120s outside BLOCK-B; opening PrintKurox-Setup AP...")
                    start_ap_mode(rescan_first=True)
        except Exception as e:
            log(f"Monitor loop notice: {e}")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        stop_ap_mode()
        sys.exit(0)
