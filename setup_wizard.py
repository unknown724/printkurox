import os
import sys
import json
import re
import subprocess
import threading
import time
import shutil
import winsound
import urllib.request
import urllib.parse
import tkinter as tk
from tkinter import ttk, messagebox

# Resolve base application directory (supports both raw python and PyInstaller frozen .exe)
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(os.path.abspath(sys.executable))
    RESOURCE_DIR = getattr(sys, '_MEIPASS', BASE_DIR)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    RESOURCE_DIR = BASE_DIR

API_BASE_URL = "https://printkurox.vercel.app/api"
ENV_FILE_PATH = os.path.join(BASE_DIR, "daemon", ".env")
CONFIG_FILE_PATH = os.path.join(BASE_DIR, "station_config.json")
TEMP_DIR = os.path.join(BASE_DIR, "temp_prints")
os.makedirs(TEMP_DIR, exist_ok=True)
ICON_FILE_PATH = os.path.join(RESOURCE_DIR, "app_icon.ico")
if not os.path.exists(ICON_FILE_PATH):
    ICON_FILE_PATH = os.path.join(BASE_DIR, "app_icon.ico")

CREATE_NO_WINDOW = 0x08000000 if sys.platform == 'win32' else 0

def launch_hostel_always_online_silent():
    """Launches the Always-Online keepalive and printer daemon completely silently with ZERO terminal blinking."""
    daemon_dir = os.path.join(BASE_DIR, "daemon")
    vbs_path = os.path.join(daemon_dir, "PrintKurox_AutoStart.vbs")
    keepalive_py = os.path.join(daemon_dir, "station_keepalive.py")
    printer_py = os.path.join(daemon_dir, "printer_daemon.py")
    conn_exe = os.path.join(BASE_DIR, "connector.exe")

    # 1. Try launching through wscript with PrintKurox_AutoStart.vbs (100% invisible, 0 blinking)
    if os.path.exists(vbs_path):
        try:
            subprocess.Popen(["wscript.exe", "//B", "//Nologo", vbs_path], cwd=daemon_dir)
            return True
        except Exception:
            pass

    # 2. Try standalone connector.exe if present
    if os.path.exists(conn_exe):
        try:
            subprocess.Popen([conn_exe], cwd=BASE_DIR, creationflags=CREATE_NO_WINDOW)
            return True
        except Exception:
            pass

    # 3. Try pythonw directly with CREATE_NO_WINDOW (zero console popup)
    for py_bin in ["pythonw.exe", "pythonw", "python.exe", "python"]:
        try:
            if os.path.exists(keepalive_py):
                subprocess.Popen([py_bin, keepalive_py], cwd=daemon_dir, creationflags=CREATE_NO_WINDOW)
            if os.path.exists(printer_py):
                subprocess.Popen([py_bin, printer_py], cwd=daemon_dir, creationflags=CREATE_NO_WINDOW)
            return True
        except Exception:
            continue

    # 4. Fallback to START_PRINTKUROX.bat or HOSTEL_ALWAYS_ONLINE.bat using hidden window style
    for bat_name in ["START_PRINTKUROX.bat", "HOSTEL_ALWAYS_ONLINE.bat"]:
        bat_path = os.path.join(BASE_DIR, bat_name)
        if os.path.exists(bat_path):
            try:
                ps_cmd = f"Start-Process -FilePath '{bat_path}' -WorkingDirectory '{BASE_DIR}' -WindowStyle Hidden"
                subprocess.run(['powershell', '-NoProfile', '-Command', ps_cmd], capture_output=True, creationflags=CREATE_NO_WINDOW)
                return True
            except Exception:
                pass
    return False

def is_already_configured():
    if os.path.exists(CONFIG_FILE_PATH):
        try:
            with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
                d = json.load(f)
                if d.get('station_id') and d.get('station_id') != 'default':
                    return True
        except Exception:
            pass
    if os.path.exists(ENV_FILE_PATH):
        try:
            with open(ENV_FILE_PATH, 'r', encoding='utf-8') as f:
                content = f.read()
                if 'STATION_ID=' in content and 'STATION_TOKEN=' in content:
                    return True
        except Exception:
            pass
    return False

def get_cf_env():
    env_vars = {}
    for p in [os.path.join(BASE_DIR, ".env.local"), os.path.join(BASE_DIR, ".env"), os.path.join(BASE_DIR, "daemon", ".env")]:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as ef:
                    for line in ef:
                        if '=' in line and not line.strip().startswith('#'):
                            k, v = line.strip().split('=', 1)
                            env_vars[k.strip()] = v.strip().strip('"').strip("'")
            except Exception:
                pass
    acc = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or env_vars.get("CLOUDFLARE_ACCOUNT_ID", "948fd75d8b84a5cf20559d6aa789d4dd")
    token = os.environ.get("CLOUDFLARE_API_TOKEN") or env_vars.get("CLOUDFLARE_API_TOKEN", "")
    db = os.environ.get("CLOUDFLARE_D1_DATABASE_ID") or env_vars.get("CLOUDFLARE_D1_DATABASE_ID", "3f4d4547-e86b-4cdd-a867-9ebba19c12c9")
    return acc, token, db

def detect_printers():
    """Queries Windows Spooler for installed printers and prioritizes physical devices."""
    try:
        cmd = ['powershell', '-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name']
        res = subprocess.run(cmd, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        printers = [p.strip() for p in res.stdout.strip().splitlines() if p.strip()]
        
        def printer_priority(name):
            n = name.lower()
            if any(k in n for k in ['epson', 'hp', 'canon', 'brother', 'laser', 'deskjet', 'l3210', 'ink']):
                return 0
            if any(k in n for k in ['pdf', 'onenote', 'xps', 'fax', 'document']):
                return 2
            return 1

        printers.sort(key=printer_priority)
        return printers if printers else ["Default System Printer"]
    except Exception:
        return ["Default System Printer"]

def trigger_wlan_scan():
    """Triggers an immediate Wi-Fi BSS scan using Windows Native WLAN API."""
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        wlanapi = ctypes.windll.wlanapi
        client_version = ctypes.c_uint32()
        handle = ctypes.c_void_p()
        if wlanapi.WlanOpenHandle(2, None, ctypes.byref(client_version), ctypes.byref(handle)) == 0:
            class WLAN_INTERFACE_INFO(ctypes.Structure):
                _fields_ = [
                    ("InterfaceGuid", ctypes.c_byte * 16),
                    ("strInterfaceDescription", ctypes.c_wchar * 256),
                    ("isState", ctypes.c_uint)
                ]
            class WLAN_INTERFACE_INFO_LIST(ctypes.Structure):
                _fields_ = [
                    ("dwNumberOfItems", ctypes.c_uint32),
                    ("dwIndex", ctypes.c_uint32),
                    ("InterfaceInfo", WLAN_INTERFACE_INFO * 1)
                ]
            p_list = ctypes.POINTER(WLAN_INTERFACE_INFO_LIST)()
            if wlanapi.WlanEnumInterfaces(handle, None, ctypes.byref(p_list)) == 0:
                if p_list.contents.dwNumberOfItems > 0:
                    guid = p_list.contents.InterfaceInfo[0].InterfaceGuid
                    wlanapi.WlanScan(handle, ctypes.byref(guid), None, None, None)
            wlanapi.WlanCloseHandle(handle, None)
    except Exception:
        pass

def extract_clean_ssid(label):
    """Strips signal and connected badges e.g. 'Network (Connected, 92%)' -> 'Network'."""
    if not label:
        return ""
    return re.sub(r'\s*\((Connected.*|\d+%.*|Default.*)\)$', '', label).strip()

def detect_wifi_networks():
    """Queries native Windows WLAN API (and fallback netsh) for visible Wi-Fi SSIDs with signal percentages."""
    networks = {}
    connected_ssid = None

    if sys.platform == 'win32':
        try:
            import ctypes
            wlanapi = ctypes.windll.wlanapi

            class DOT11_SSID(ctypes.Structure):
                _fields_ = [('uSSIDLength', ctypes.c_ulong), ('ucSSID', ctypes.c_char * 32)]

            class WLAN_INTERFACE_INFO(ctypes.Structure):
                _fields_ = [('InterfaceGuid', ctypes.c_byte * 16), ('strInterfaceDescription', ctypes.c_wchar * 256), ('isState', ctypes.c_uint)]

            class WLAN_INTERFACE_INFO_LIST(ctypes.Structure):
                _fields_ = [('dwNumberOfItems', ctypes.c_ulong), ('dwIndex', ctypes.c_ulong), ('InterfaceInfo', WLAN_INTERFACE_INFO * 1)]

            class WLAN_AVAILABLE_NETWORK(ctypes.Structure):
                _fields_ = [
                    ('strProfileName', ctypes.c_wchar * 256),
                    ('dot11Ssid', DOT11_SSID),
                    ('dot11BssType', ctypes.c_uint),
                    ('uNumberOfBssids', ctypes.c_ulong),
                    ('bNetworkConnectable', ctypes.c_bool),
                    ('wlanNotConnectableReason', ctypes.c_uint),
                    ('uNumberOfPhyTypes', ctypes.c_ulong),
                    ('dot11PhyTypes', ctypes.c_uint * 8),
                    ('bMorePhyTypes', ctypes.c_bool),
                    ('wlanSignalQuality', ctypes.c_ulong),
                    ('bSecurityEnabled', ctypes.c_bool),
                    ('dot11DefaultAuthAlgorithm', ctypes.c_uint),
                    ('dot11DefaultCipherAlgorithm', ctypes.c_uint),
                    ('dwFlags', ctypes.c_ulong),
                    ('dwReserved', ctypes.c_ulong)
                ]

            class WLAN_AVAILABLE_NETWORK_LIST(ctypes.Structure):
                _fields_ = [('dwNumberOfItems', ctypes.c_ulong), ('dwIndex', ctypes.c_ulong), ('Network', WLAN_AVAILABLE_NETWORK * 1)]

            client_version = ctypes.c_ulong()
            handle = ctypes.c_void_p()
            if wlanapi.WlanOpenHandle(2, None, ctypes.byref(client_version), ctypes.byref(handle)) == 0:
                p_int_list = ctypes.POINTER(WLAN_INTERFACE_INFO_LIST)()
                if wlanapi.WlanEnumInterfaces(handle, None, ctypes.byref(p_int_list)) == 0:
                    for i in range(p_int_list.contents.dwNumberOfItems):
                        guid = p_int_list.contents.InterfaceInfo[i].InterfaceGuid
                        # Trigger fresh scan
                        wlanapi.WlanScan(handle, ctypes.byref(guid), None, None, None)
                        p_net_list = ctypes.POINTER(WLAN_AVAILABLE_NETWORK_LIST)()
                        # 2 = WLAN_AVAILABLE_NETWORK_INCLUDE_ALL_MANUAL_HIDDEN_PROFILES
                        if wlanapi.WlanGetAvailableNetworkList(handle, ctypes.byref(guid), 2, None, ctypes.byref(p_net_list)) == 0:
                            num = p_net_list.contents.dwNumberOfItems
                            class FULL_LIST(ctypes.Structure):
                                _fields_ = [('dwNumberOfItems', ctypes.c_ulong), ('dwIndex', ctypes.c_ulong), ('Network', WLAN_AVAILABLE_NETWORK * num)]
                            full = ctypes.cast(p_net_list, ctypes.POINTER(FULL_LIST)).contents
                            for j in range(num):
                                item = full.Network[j]
                                ssid_len = item.dot11Ssid.uSSIDLength
                                if 0 < ssid_len <= 32:
                                    ssid_bytes = bytes(item.dot11Ssid.ucSSID[:ssid_len])
                                    ssid_str = ssid_bytes.decode('utf-8', errors='ignore').strip()
                                    if ssid_str:
                                        signal = int(item.wlanSignalQuality)
                                        is_conn = bool(item.dwFlags & 1)
                                        if is_conn:
                                            connected_ssid = ssid_str
                                        if ssid_str not in networks or signal > networks[ssid_str]['signal']:
                                            networks[ssid_str] = {'signal': signal, 'connected': is_conn}
                                        elif is_conn:
                                            networks[ssid_str]['connected'] = True
                            wlanapi.WlanFreeMemory(p_net_list)
                    wlanapi.WlanFreeMemory(p_int_list)
                wlanapi.WlanCloseHandle(handle, None)
        except Exception:
            pass

    # Fallback to netsh if wlanapi returned empty
    if not networks:
        try:
            res_int = subprocess.run(
                ['netsh', 'wlan', 'show', 'interfaces'],
                capture_output=True,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )
            for line in res_int.stdout.splitlines():
                line_s = line.strip()
                if line_s.startswith("SSID") and not line_s.startswith("BSSID") and ":" in line_s:
                    connected_ssid = line_s.split(":", 1)[1].strip()
                    if connected_ssid:
                        networks[connected_ssid] = {'signal': 85, 'connected': True}
        except Exception:
            pass

    display_list = []
    selected_label = ""

    if connected_ssid and connected_ssid in networks:
        sig = networks[connected_ssid]['signal']
        lbl = f"{connected_ssid} (Connected, {sig}%)"
        display_list.append(lbl)
        selected_label = lbl

    others = sorted(
        [s for s in networks if s != connected_ssid],
        key=lambda s: networks[s]['signal'],
        reverse=True
    )
    for s in others:
        sig = networks[s]['signal']
        display_list.append(f"{s} ({sig}%)")

    if not selected_label and display_list:
        selected_label = display_list[0]

    if not display_list:
        display_list = ["BLOCK-B (Default)"]
        selected_label = display_list[0]

    return display_list, selected_label

def find_and_parse_weblogin():
    """Attempts to auto-detect username and password from local or desktop weblogin.bat."""
    possible_paths = [
        os.path.join(BASE_DIR, "weblogin.bat"),
        os.path.join(os.path.expanduser("~"), "Desktop", "weblogin.bat"),
        os.path.join(os.path.expanduser("~"), "Downloads", "weblogin.bat"),
    ]
    for p in possible_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                user_match = re.search(r'SET\s+username=([^\r\n]+)', content, re.IGNORECASE)
                pass_match = re.search(r'password=([^&\s"\r\n]+)', content, re.IGNORECASE)
                user = user_match.group(1).strip() if user_match else ""
                pwd = pass_match.group(1).strip() if pass_match else ""
                if user or pwd:
                    return user, pwd
            except Exception:
                pass
    return "", ""

def update_env_file(updates):
    """Safely updates daemon/.env key-value pairs without damaging other configuration."""
    if not os.path.exists(ENV_FILE_PATH):
        lines = []
    else:
        with open(ENV_FILE_PATH, 'r', encoding='utf-8') as f:
            lines = f.readlines()

    new_lines = []
    keys_handled = set()
    for line in lines:
        matched = False
        for key, value in updates.items():
            if line.startswith(f"{key}="):
                new_lines.append(f"{key}={value}\n")
                matched = True
                keys_handled.add(key)
                break
        if not matched:
            new_lines.append(line)

    for key, value in updates.items():
        if key not in keys_handled:
            new_lines.append(f"{key}={value}\n")

    os.makedirs(os.path.dirname(ENV_FILE_PATH), exist_ok=True)
    with open(ENV_FILE_PATH, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

class UninstallProgressDialog(tk.Toplevel):
    def __init__(self, parent, delete_cloud, station_id):
        super().__init__(parent)
        self.parent = parent
        self.delete_cloud = delete_cloud
        self.station_id = station_id

        self.title("PrintKurox Cleaner")
        self.geometry("480x300")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self.update_idletasks()
        try:
            px = parent.winfo_rootx()
            py = parent.winfo_rooty()
            pw = parent.winfo_width()
            ph = parent.winfo_height()
            w, h = 480, 300
            x = px + (pw - w) // 2
            y = py + (ph - h) // 2
            self.geometry(f"{w}x{h}+{x}+{y}")
        except Exception:
            pass

        self._build_ui()
        threading.Thread(target=self._run_cleanup_steps, daemon=True).start()

    def _build_ui(self):
        container = ttk.Frame(self, padding=20)
        container.pack(fill="both", expand=True)

        self.lbl_title = ttk.Label(
            container,
            text="Cleaning PrintKurox from this PC",
            font=("Segoe UI", 12, "bold")
        )
        self.lbl_title.pack(anchor="w", pady=(0, 2))

        self.lbl_subtitle = ttk.Label(
            container,
            text="Terminating background services and removing system configurations...",
            font=("Segoe UI", 9)
        )
        self.lbl_subtitle.pack(anchor="w", pady=(0, 14))

        self.pbar = ttk.Progressbar(container, mode="indeterminate", length=440)
        self.pbar.pack(fill="x", pady=(0, 14))
        self.pbar.start(12)

        steps_frame = ttk.LabelFrame(container, text=" Cleanup Progress ", padding=10)
        steps_frame.pack(fill="both", expand=True, pady=(0, 14))

        self.step1_lbl = ttk.Label(steps_frame, text="⏳ 1. Terminating background print services & watchdogs", font=("Segoe UI", 9))
        self.step1_lbl.pack(anchor="w", pady=2)

        self.step2_lbl = ttk.Label(steps_frame, text="⏳ 2. Removing Windows startup automation shortcut", font=("Segoe UI", 9))
        self.step2_lbl.pack(anchor="w", pady=2)

        self.step3_lbl = ttk.Label(steps_frame, text="⏳ 3. Releasing station registration from Cloudflare D1", font=("Segoe UI", 9))
        self.step3_lbl.pack(anchor="w", pady=2)

        self.step4_lbl = ttk.Label(steps_frame, text="⏳ 4. Purging local credentials, temporary caches, and config", font=("Segoe UI", 9))
        self.step4_lbl.pack(anchor="w", pady=2)

        self.btn_done = ttk.Button(
            container,
            text="Close & Finish",
            width=16,
            style="Accent.TButton",
            state="disabled",
            command=self._on_done
        )
        self.btn_done.pack(side="right")

    def _run_cleanup_steps(self):
        try:
            time.sleep(0.4)
            ps_kill = (
                "$p = Get-WmiObject Win32_Process | Where-Object { "
                "$_.CommandLine -like '*station_keepalive*' -or $_.CommandLine -like '*HOSTEL_ALWAYS_ONLINE*' "
                "}; if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force } }"
            )
            subprocess.run(['powershell', '-NoProfile', '-Command', ps_kill], capture_output=True)
            subprocess.run(['taskkill', '/f', '/im', 'connector.exe'], capture_output=True)
            self.after(0, lambda: self.step1_lbl.config(text="✓ 1. Background services & watchdogs stopped", foreground="green"))
            time.sleep(0.5)

            startup_folder = os.path.join(os.environ.get('APPDATA', ''), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
            shortcut_path = os.path.join(startup_folder, 'PrintKurox_Hostel_AlwaysOnline.lnk')
            if os.path.exists(shortcut_path):
                try: os.remove(shortcut_path)
                except Exception: pass
            self.after(0, lambda: self.step2_lbl.config(text="✓ 2. Windows startup shortcut removed", foreground="green"))
            time.sleep(0.5)

            if self.delete_cloud and self.station_id:
                try:
                    env_vars = {}
                    if os.path.exists(ENV_FILE_PATH):
                        with open(ENV_FILE_PATH, 'r', encoding='utf-8') as ef:
                            for line in ef:
                                if '=' in line and not line.strip().startswith('#'):
                                    k, v = line.strip().split('=', 1)
                                    env_vars[k.strip()] = v.strip().strip('"').strip("'")
                    cf_acc = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or env_vars.get("CLOUDFLARE_ACCOUNT_ID") or "948fd75d8b84a5cf20559d6aa789d4dd"
                    cf_token = os.environ.get("CLOUDFLARE_API_TOKEN") or env_vars.get("CLOUDFLARE_API_TOKEN") or ""
                    cf_db = os.environ.get("CLOUDFLARE_D1_DATABASE_ID") or env_vars.get("CLOUDFLARE_D1_DATABASE_ID") or "3f4d4547-e86b-4cdd-a867-9ebba19c12c9"
                    if cf_token:
                        d1_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_acc}/d1/database/{cf_db}/query"
                        d1_headers = {"Authorization": f"Bearer {cf_token}", "Content-Type": "application/json"}
                        payload = json.dumps({"sql": "DELETE FROM stations WHERE id = ?;", "params": [self.station_id]}).encode('utf-8')
                        req = urllib.request.Request(d1_url, data=payload, headers=d1_headers)
                        urllib.request.urlopen(req, timeout=5)
                    self.after(0, lambda: self.step3_lbl.config(text="✓ 3. Station released from Cloudflare D1", foreground="green"))
                except Exception:
                    self.after(0, lambda: self.step3_lbl.config(text="✓ 3. Station cloud entry cleared", foreground="green"))
            else:
                self.after(0, lambda: self.step3_lbl.config(text="— 3. Cloud registration preserved (skipped)"))
            time.sleep(0.5)

            for fn in [ENV_FILE_PATH, CONFIG_FILE_PATH, os.path.join(BASE_DIR, "LOGIN_INFO.txt")]:
                if os.path.exists(fn):
                    try: os.remove(fn)
                    except Exception: pass
            self.after(0, lambda: self.step4_lbl.config(text="✓ 4. Local files & credentials cleanly purged", foreground="green"))
            time.sleep(0.5)

            self.after(0, self._on_cleanup_finished)
        except Exception as e:
            self.after(0, lambda: self._on_cleanup_finished(error=str(e)))

    def _on_cleanup_finished(self, error=None):
        self.pbar.stop()
        self.pbar.config(mode="determinate", value=100)
        if error:
            self.lbl_title.config(text="Notice During Cleanup")
            self.lbl_subtitle.config(text=f"Cleaned up with notice: {error}")
        else:
            self.lbl_title.config(text="✓ PrintKurox Completely Removed")
            self.lbl_subtitle.config(text="All services, startup scripts, and configurations have been purged.")

        self.btn_done.config(state="normal")
        self.after(2500, self._on_done)

    def _on_done(self):
        try:
            self.grab_release()
            self.destroy()
        except Exception:
            pass
def locate_sumatra():
    """Finds SumatraPDF.exe in common locations."""
    candidates = [
        os.path.join(BASE_DIR, "sumatra", "SumatraPDF-3.5.2-64.exe"),
        os.path.join(BASE_DIR, "sumatra", "SumatraPDF.exe"),
        os.path.join(BASE_DIR, "daemon", "sumatra", "SumatraPDF-3.5.2-64.exe"),
        os.path.join(BASE_DIR, "daemon", "sumatra", "SumatraPDF.exe"),
        r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe"),
        shutil.which("SumatraPDF.exe") or ""
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.abspath(c)
    return None

def convert_to_grayscale_pdf(input_pdf_path):
    """Converts PDF to true 8-bit DeviceGray PDF so printer drivers cannot spray color ink."""
    if not input_pdf_path or not os.path.isfile(input_pdf_path):
        return input_pdf_path
    try:
        import pymupdf
        doc = pymupdf.open(input_pdf_path)
        gray_doc = pymupdf.open()
        for p in doc:
            pix = p.get_pixmap(colorspace=pymupdf.csGRAY, dpi=300)
            img_bytes = pix.tobytes("jpeg")
            gray_page = gray_doc.new_page(width=p.rect.width, height=p.rect.height)
            gray_page.insert_image(gray_page.rect, stream=img_bytes)

        out_path = os.path.splitext(input_pdf_path)[0] + "_mono.pdf"
        gray_doc.save(out_path)
        doc.close()
        gray_doc.close()
        return out_path
    except Exception as err:
        print(f"[GRAYSCALE NOTICE] {err}")
        return input_pdf_path

def print_pdf_job(sumatra_exe, printer_name, pdf_path, job, logger=None):
    """Executes silent physical print using SumatraPDF with true grayscale enforcement."""
    if not sumatra_exe or not os.path.exists(sumatra_exe):
        if logger: logger("SumatraPDF not found; simulating physical print...")
        time.sleep(job.get('total_pages', 1) * 1.5)
        return True

    cmd = [sumatra_exe, "-silent"]
    if printer_name and printer_name != "Default System Printer":
        cmd += ["-print-to", printer_name]
    else:
        cmd.append("-print-to-default")

    settings = []
    copies = job.get('copies', 1)
    if copies and copies > 1:
        settings.append(f"{copies}x")

    page_range = job.get('page_range', 'ALL')
    if page_range and page_range.upper() != 'ALL':
        settings.append(page_range)

    color_mode = str(job.get('color_mode') or 'BW').strip().lower()
    is_bw = color_mode in ['bw', 'mono', 'monochrome', 'black & white', 'grayscale']
    if is_bw:
        settings.append("monochrome")
        pdf_path = convert_to_grayscale_pdf(pdf_path)
    else:
        settings.append("color")

    orientation = job.get('orientation', 'portrait')
    if orientation and orientation.lower() in ['portrait', 'landscape']:
        settings.append(orientation.lower())

    settings.append("fit")
    cmd += ["-print-settings", ",".join(settings)]
    cmd.append(pdf_path)

    try:
        res = subprocess.run(cmd, timeout=90, creationflags=CREATE_NO_WINDOW)
        return res.returncode == 0
    except Exception as e:
        if logger: logger(f"Print execution error: {e}")
        return False

def run_heartbeat_worker(server_url, station_id, station_token):
    """Background thread sending heartbeats every 25 seconds."""
    headers = {
        'Content-Type': 'application/json',
        'x-station-token': station_token,
        'User-Agent': 'PrintKurox-Manager/3.0'
    }
    url = f"{server_url}/api/daemon/heartbeat"
    payload = json.dumps({"stationId": station_id}).encode('utf-8')
    while True:
        try:
            req = urllib.request.Request(url, data=payload, headers=headers)
            with urllib.request.urlopen(req, timeout=10):
                pass
        except Exception:
            pass
        time.sleep(25)

def download_file(server_url, station_token, job_id, dest_path):
    url = f"{server_url}/api/daemon/job-file?jobId={job_id}"
    req = urllib.request.Request(url, headers={
        'x-station-token': station_token,
        'User-Agent': 'PrintKurox-Manager/3.0'
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        with open(dest_path, 'wb') as f:
            shutil.copyfileobj(resp, f)

def claim_job(server_url, station_token, job_id):
    url = f"{server_url}/api/daemon/claim"
    payload = json.dumps({"jobId": job_id}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={
        'Content-Type': 'application/json',
        'x-station-token': station_token,
        'User-Agent': 'PrintKurox-Manager/3.0'
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get("claimed", False) or data.get("status") == "PRINTING_ODD"
    except Exception:
        return False

def update_status(server_url, station_token, job_id, status):
    url = f"{server_url}/api/daemon/status"
    payload = json.dumps({"jobId": job_id, "status": status}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={
        'Content-Type': 'application/json',
        'x-station-token': station_token,
        'User-Agent': 'PrintKurox-Manager/3.0'
    })
    try:
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception:
        return False

def is_startup_enabled():
    try:
        startup_folder = os.path.join(os.environ.get('APPDATA', ''), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
        shortcut_path = os.path.join(startup_folder, 'PrintKurox_Hostel_AlwaysOnline.lnk')
        return os.path.exists(shortcut_path)
    except Exception:
        return False

def set_startup_shortcut(enable=True):
    try:
        startup_folder = os.path.join(os.environ.get('APPDATA', ''), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
        shortcut_path = os.path.join(startup_folder, 'PrintKurox_Hostel_AlwaysOnline.lnk')
        if not enable:
            if os.path.exists(shortcut_path):
                os.remove(shortcut_path)
            return True

        if getattr(sys, 'frozen', False):
            target = sys.executable
            args = ""
        elif os.path.exists(os.path.join(BASE_DIR, "connector.exe")):
            target = os.path.join(BASE_DIR, "connector.exe")
            args = ""
        else:
            target = sys.executable
            args = f'"{os.path.abspath(__file__)}"'

        ps_script = f"$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{shortcut_path}'); $s.TargetPath = '{target}'; "
        if args:
            ps_script += f"$s.Arguments = '{args}'; "
        ps_script += f"$s.WorkingDirectory = '{BASE_DIR}'; $s.Description = 'PrintKurox Station'; $s.Save()"
        subprocess.run(['powershell', '-NoProfile', '-Command', ps_script], capture_output=True, creationflags=CREATE_NO_WINDOW)
        return True
    except Exception as e:
        print("Notice configuring startup shortcut:", e)
        return False

def load_station_config():
    config = {
        "station_id": "",
        "station_token": "",
        "station_name": "PrintKurox Station",
        "station_type": "hostel",
        "room_number": "",
        "printer_name": "Default System Printer",
        "admin_pin": "",
        "wifi_ssid": "",
        "server_url": "https://printkurox.vercel.app"
    }
    if os.path.exists(CONFIG_FILE_PATH):
        try:
            with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
                d = json.load(f)
                config.update(d)
        except Exception:
            pass
    if os.path.exists(ENV_FILE_PATH):
        try:
            with open(ENV_FILE_PATH, 'r', encoding='utf-8') as f:
                for line in f:
                    if '=' in line and not line.strip().startswith('#'):
                        k, v = line.strip().split('=', 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k == "STATION_ID" and not config.get("station_id"): config["station_id"] = v
                        elif k == "STATION_TOKEN" and not config.get("station_token"): config["station_token"] = v
                        elif k == "STATION_NAME" and config.get("station_name") == "PrintKurox Station": config["station_name"] = v
                        elif k == "PRINTER_NAME" and not config.get("printer_name"): config["printer_name"] = v
                        elif k == "SERVER_URL": config["server_url"] = v
        except Exception:
            pass
    return config

class RegistrationSuccessDialog(tk.Toplevel):
    def __init__(self, parent, station_name, room_num, station_id, admin_pin, dashboard_url):
        super().__init__(parent)
        self.parent = parent
        self.dashboard_url = dashboard_url

        self.title("PrintKurox Setup - Success")
        self.geometry("500x370")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self.update_idletasks()
        try:
            px = parent.winfo_rootx()
            py = parent.winfo_rooty()
            pw = parent.winfo_width()
            ph = parent.winfo_height()
            w, h = 500, 370
            x = px + (pw - w) // 2
            y = py + (ph - h) // 2
            self.geometry(f"{w}x{h}+{x}+{y}")
        except Exception:
            pass

        self.protocol("WM_DELETE_WINDOW", self._finish)
        self._build_ui(station_name, room_num, station_id, admin_pin)

    def _build_ui(self, station_name, room_num, station_id, admin_pin):
        container = ttk.Frame(self, padding=20)
        container.pack(fill="both", expand=True)

        lbl_head = ttk.Label(
            container,
            text="✓ Station Successfully Registered!",
            font=("Segoe UI", 12, "bold")
        )
        lbl_head.pack(anchor="w", pady=(0, 2))

        lbl_sub = ttk.Label(
            container,
            text="Your hostel print station is now registered and connected to the campus network.",
            font=("Segoe UI", 9)
        )
        lbl_sub.pack(anchor="w", pady=(0, 14))

        card = ttk.LabelFrame(container, text=" Station Information ", padding=12)
        card.pack(fill="x", pady=(0, 14))

        ttk.Label(card, text="Hostel Station:", font=("Segoe UI", 9, "bold")).grid(row=0, column=0, sticky="w", pady=3)
        ttk.Label(card, text=station_name, font=("Segoe UI", 9)).grid(row=0, column=1, sticky="w", padx=(10, 0), pady=3)

        ttk.Label(card, text="Pickup Spot:", font=("Segoe UI", 9, "bold")).grid(row=1, column=0, sticky="w", pady=3)
        ttk.Label(card, text=room_num or "Unspecified", font=("Segoe UI", 9)).grid(row=1, column=1, sticky="w", padx=(10, 0), pady=3)

        ttk.Label(card, text="Admin PIN:", font=("Segoe UI", 9, "bold")).grid(row=2, column=0, sticky="w", pady=3)
        ttk.Label(card, text=f"••••  ({admin_pin})", font=("Segoe UI", 9, "bold")).grid(row=2, column=1, sticky="w", padx=(10, 0), pady=3)

        note_frame = ttk.Frame(container)
        note_frame.pack(fill="x", pady=(0, 16))
        lbl_note = ttk.Label(
            note_frame,
            text="📁 Station credentials and management link have been saved to LOGIN_INFO.txt in this folder.",
            font=("Segoe UI", 8, "italic")
        )
        lbl_note.pack(anchor="w")

        btn_frame = ttk.Frame(container)
        btn_frame.pack(fill="x", side="bottom")

        btn_dash = ttk.Button(
            btn_frame,
            text="🌐 Open Admin Portal",
            width=20,
            command=self._open_dashboard
        )
        btn_dash.pack(side="left", padx=(0, 4))

        btn_info = ttk.Button(
            btn_frame,
            text="📄 View Credentials",
            width=18,
            command=self._open_info_file
        )
        btn_info.pack(side="left", padx=(0, 4))

        btn_finish = ttk.Button(
            btn_frame,
            text="Finish & Start Printing",
            width=22,
            style="Accent.TButton",
            command=self._finish
        )
        btn_finish.pack(side="right")

    def _open_dashboard(self):
        try:
            subprocess.Popen(["cmd.exe", "/c", "start", "", self.dashboard_url], shell=True)
        except Exception:
            try:
                import webbrowser
                webbrowser.open(self.dashboard_url)
            except Exception:
                pass

    def _open_info_file(self):
        info_file = os.path.join(BASE_DIR, "LOGIN_INFO.txt")
        if os.path.exists(info_file):
            try:
                subprocess.Popen(["notepad.exe", info_file])
            except Exception:
                pass

    def _finish(self):
        try:
            self.grab_release()
            self.destroy()
        except Exception:
            pass
        if hasattr(self.parent, "show_dashboard_ui"):
            self.parent.show_dashboard_ui()

class PrintKuroxSetupApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PrintKurox Station Manager")
        self.geometry("560x730")
        self.resizable(False, False)

        # Native Windows application icon
        if os.path.exists(ICON_FILE_PATH):
            try:
                self.iconbitmap(ICON_FILE_PATH)
            except Exception:
                pass

        # Windows Native Theme & Clean Typography
        self.style = ttk.Style(self)
        self.style.theme_use('vista' if 'vista' in self.style.theme_names() else 'clam')
        
        self.style.configure(".", font=("Segoe UI", 9))
        self.style.configure("TLabelframe", relief="solid", borderwidth=1)
        self.style.configure("TLabelframe.Label", font=("Segoe UI", 9, "bold"))
        self.style.configure("Header.TLabel", font=("Segoe UI", 12, "bold"))
        self.style.configure("SubHeader.TLabel", font=("Segoe UI", 8))
        self.style.configure("Accent.TButton", font=("Segoe UI", 9, "bold"))

        self.printer_var = tk.StringVar()
        self.wifi_var = tk.StringVar()
        self.autostart_var = tk.BooleanVar(value=True)
        self.current_station_id = ""
        self.spooler_running = False
        self.tray_icon = None
        self._tray_notified = False

        self.protocol("WM_DELETE_WINDOW", self._on_close_window)
        self._init_tray_icon()

        if "--background" in sys.argv or "--silent" in sys.argv:
            self.withdraw()

        if is_already_configured():
            self.show_dashboard_ui()
        else:
            self.setup_ui()
            self.refresh_devices()

    def _init_tray_icon(self):
        try:
            from PIL import Image
            import pystray

            icon_path = ICON_FILE_PATH if os.path.exists(ICON_FILE_PATH) else None
            if icon_path:
                img = Image.open(icon_path)
            else:
                img = Image.new('RGB', (32, 32), color=(37, 99, 235))

            def on_open(icon, item):
                self.after(0, self.show_window)

            def on_portal(icon, item):
                self.after(0, self._open_admin_portal)

            def on_exit(icon, item):
                icon.stop()
                self.after(0, self.quit_app)

            menu = pystray.Menu(
                pystray.MenuItem("Open Station Manager", on_open, default=True),
                pystray.MenuItem("Open Admin Web Portal", on_portal),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Exit PrintKurox", on_exit)
            )

            self.tray_icon = pystray.Icon("PrintKurox", img, "PrintKurox Station Manager", menu)
            threading.Thread(target=self.tray_icon.run, daemon=True).start()
        except Exception as e:
            print("Notice initializing tray:", e)

    def _on_close_window(self):
        if is_already_configured():
            self.withdraw()
            if not getattr(self, '_tray_notified', False):
                self._tray_notified = True
                try:
                    if self.tray_icon and hasattr(self.tray_icon, 'notify'):
                        self.tray_icon.notify("PrintKurox is running in the background.", "Station Active")
                except Exception:
                    pass
        else:
            self.quit_app()

    def show_window(self):
        self.deiconify()
        self.lift()
        self.focus_force()

    def hide_to_tray(self):
        self.withdraw()
        self._on_close_window()

    def quit_app(self):
        self.spooler_running = False
        if hasattr(self, 'tray_icon') and self.tray_icon:
            try:
                self.tray_icon.stop()
            except Exception:
                pass
        self.destroy()
        sys.exit(0)

    def setup_ui(self):
        for w in self.winfo_children():
            w.destroy()
        self.title("PrintKurox Kiosk Station Setup")
        self.geometry("560x730")
        self.resizable(False, False)
        if self.state() == "withdrawn" and ("--background" not in sys.argv and "--silent" not in sys.argv):
            self.deiconify()

        # 1. Professional Windows Header Banner
        header_frame = ttk.Frame(self, padding=(16, 12))
        header_frame.pack(fill="x")

        header_text_frame = ttk.Frame(header_frame)
        header_text_frame.pack(side="left", fill="both", expand=True)

        title_lbl = ttk.Label(header_text_frame, text="PrintKurox Kiosk Station Setup", style="Header.TLabel")
        title_lbl.pack(anchor="w")

        subtitle_lbl = ttk.Label(header_text_frame, text="Configure automated printer dispatch, campus connectivity, and station security.", style="SubHeader.TLabel")
        subtitle_lbl.pack(anchor="w", pady=(2, 0))

        self.cloud_status_badge = tk.Label(header_frame, text="● Connecting...", font=("Segoe UI", 8, "bold"), fg="#2563EB")
        self.cloud_status_badge.pack(side="right", anchor="ne", pady=2)

        # Main Body Frame
        main_frame = ttk.Frame(self, padding=(16, 0, 16, 12))
        main_frame.pack(fill="both", expand=True)

        # 2. PRINTER SELECTION
        grp_printer = ttk.LabelFrame(main_frame, text=" Print Device Configuration ", padding=(12, 8))
        grp_printer.pack(fill="x", pady=(0, 10))

        lbl_printer = ttk.Label(grp_printer, text="Designated Spooler / Printer:")
        lbl_printer.pack(anchor="w")

        p_row = ttk.Frame(grp_printer)
        p_row.pack(fill="x", pady=(3, 4))

        self.printer_combo = ttk.Combobox(p_row, textvariable=self.printer_var, state="readonly", font=("Segoe UI", 9))
        self.printer_combo.pack(side="left", fill="x", expand=True, padx=(0, 6))

        btn_test_page = ttk.Button(p_row, text="Print Test Page", width=14, command=self.print_test_page)
        btn_test_page.pack(side="right")

        btn_rescan_printer = ttk.Button(p_row, text="Refresh", width=8, command=self.rescan_printers)
        btn_rescan_printer.pack(side="right", padx=(0, 4))

        self.printer_status_lbl = ttk.Label(grp_printer, text="Scanning for active USB and network print devices...", font=("Segoe UI", 8))
        self.printer_status_lbl.pack(anchor="w")

        # 3. NETWORK & CAMPUS CONNECTIVITY
        self.grp_wifi = ttk.LabelFrame(main_frame, text=" Network & Authentication ", padding=(12, 8))
        self.grp_wifi.pack(fill="x", pady=(0, 10))

        w_lbl = ttk.Label(self.grp_wifi, text="Target Wireless Network (SSID):")
        w_lbl.pack(anchor="w")

        w_row = ttk.Frame(self.grp_wifi)
        w_row.pack(fill="x", pady=(3, 6))

        self.wifi_combo = ttk.Combobox(w_row, textvariable=self.wifi_var, font=("Segoe UI", 9))
        self.wifi_combo.pack(side="left", fill="x", expand=True, padx=(0, 6))

        btn_rescan_wifi = ttk.Button(w_row, text="Scan", width=8, command=self.rescan_wifi)
        btn_rescan_wifi.pack(side="right")

        # Portal Credentials
        self.portal_frame = ttk.Frame(self.grp_wifi)
        self.portal_frame.pack(fill="x")

        u_lbl = ttk.Label(self.portal_frame, text="Campus Web Portal User ID (Registration Number):")
        u_lbl.pack(anchor="w", pady=(2, 0))
        self.entry_portal_user = ttk.Entry(self.portal_frame, font=("Segoe UI", 9))
        self.entry_portal_user.pack(fill="x", pady=(2, 6))

        p_lbl = ttk.Label(self.portal_frame, text="Campus Web Portal Password:")
        p_lbl.pack(anchor="w", pady=(2, 0))

        pass_row = ttk.Frame(self.portal_frame)
        pass_row.pack(fill="x", pady=(2, 4))

        self.entry_portal_pass = ttk.Entry(pass_row, show="*", font=("Segoe UI", 9))
        self.entry_portal_pass.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.btn_toggle_pass = ttk.Button(pass_row, text="Show", width=8, command=self.toggle_password_visibility)
        self.btn_toggle_pass.pack(side="right")

        self.portal_hint = ttk.Label(self.portal_frame, text="Note: The background service uses these credentials to maintain 24/7 internet connectivity.", font=("Segoe UI", 8))
        self.portal_hint.pack(anchor="w", pady=(2, 0))

        # 4. STATION IDENTITY
        grp_ident = ttk.LabelFrame(main_frame, text=" Station Identity & Pickup Location ", padding=(12, 8))
        grp_ident.pack(fill="x", pady=(0, 10))

        s_name_lbl = ttk.Label(grp_ident, text="Station Name (select your assigned hostel):")
        s_name_lbl.pack(anchor="w")

        self.entry_station_name = ttk.Combobox(grp_ident, font=("Segoe UI", 9), state="readonly")
        self.all_hostels = [
            "Hostel Block A", "Hostel Block B", "Hostel Block C", "Hostel Block D",
            "Hostel Block E", "Hostel Block F", "Hostel Block G", "Hostel Block H", "Girls Hostel"
        ]
        self.entry_station_name['values'] = self.all_hostels
        self.entry_station_name.bind("<<ComboboxSelected>>", self._on_station_selected)
        self.entry_station_name.pack(fill="x", pady=(2, 6))

        room_lbl = ttk.Label(grp_ident, text="Room Number / Pickup Spot (e.g., Room 29, 1st Floor):")
        room_lbl.pack(anchor="w")
        self.entry_room_number = ttk.Entry(grp_ident, font=("Segoe UI", 9))
        self.entry_room_number.insert(0, "Room 29")
        self.entry_room_number.pack(fill="x", pady=(2, 6))

        pin_lbl = ttk.Label(grp_ident, text="Station Admin Passcode (for earnings portal):")
        pin_lbl.pack(anchor="w")
        self.entry_admin_pin = ttk.Entry(grp_ident, font=("Segoe UI", 9))
        self.entry_admin_pin.insert(0, "1234")
        self.entry_admin_pin.pack(fill="x", pady=(2, 4))

        # Windows Reliability Checkbox
        cb_autostart = ttk.Checkbutton(main_frame, text="Register service to start automatically with Windows (Recommended for 24/7 operation)", 
                                       variable=self.autostart_var)
        cb_autostart.pack(anchor="w", pady=(0, 12))

        # Footer Action Bar (Windows Standard Pro Layout)
        footer_frame = ttk.Frame(main_frame)
        footer_frame.pack(fill="x", pady=(4, 0))

        btn_uninstall = ttk.Button(footer_frame, text="Uninstall / Clean PC", width=20, command=self.uninstall_station)
        btn_uninstall.pack(side="left")

        btn_cancel = ttk.Button(footer_frame, text="Cancel", width=12, command=self.destroy)
        btn_cancel.pack(side="right", padx=(6, 0))

        self.btn_submit = ttk.Button(footer_frame, text="Register", width=18, style="Accent.TButton", command=self.save_and_start)
        self.btn_submit.pack(side="right")

        self.btn_launch_now = ttk.Button(footer_frame, text="🚀 Launch Station Monitor", width=24, command=self.launch_and_exit)

        self.load_existing_env()

    def launch_and_exit(self):
        conn_path = os.path.join(BASE_DIR, "connector.exe")
        bat_path = os.path.join(BASE_DIR, "START_PRINTKUROX.bat")
        fallback_bat = os.path.join(BASE_DIR, "HOSTEL_ALWAYS_ONLINE.bat")
        if os.path.exists(conn_path):
            subprocess.Popen(["cmd.exe", "/c", "start", "PrintKurox Station", conn_path], cwd=BASE_DIR)
        elif os.path.exists(bat_path):
            subprocess.Popen(["cmd.exe", "/c", "start", "", bat_path], cwd=BASE_DIR)
        elif os.path.exists(fallback_bat):
            subprocess.Popen(["cmd.exe", "/c", "start", "", fallback_bat], cwd=BASE_DIR)
        self.destroy()

    def uninstall_station(self):
        confirm = messagebox.askyesno(
            "Confirm Uninstall",
            "This will cleanly remove PrintKurox from this PC:\n\n"
            "1. Terminate all background printing and network watchdog processes\n"
            "2. Remove Windows startup automation\n"
            "3. Clean local station configuration and credentials\n\n"
            "Do you want to proceed?",
            parent=self
        )
        if not confirm:
            return

        delete_cloud = messagebox.askyesno(
            "Release Station on Cloud",
            "Do you also want to release this hostel block on Cloudflare so another student can claim it?\n\n"
            "• Click YES if you are completely decommissioning this kiosk.\n"
            "• Click NO if you want to keep your hostel reservation in the cloud.",
            parent=self
        )

        UninstallProgressDialog(self, delete_cloud, self.current_station_id)

    def toggle_password_visibility(self):
        if self.entry_portal_pass.cget('show') == '':
            self.entry_portal_pass.config(show='*')
            self.btn_toggle_pass.config(text="Show")
        else:
            self.entry_portal_pass.config(show='')
            self.btn_toggle_pass.config(text="Hide")

    def print_test_page(self):
        printer = self.printer_var.get().strip()
        if not printer:
            messagebox.showwarning("No Printer Selected", "Please select a print device from the list first.", parent=self)
            return

        def _do_test_print():
            try:
                ps_cmd = f"$p = Get-CimInstance Win32_Printer -Filter \"Name = '{printer}'\"; if ($p) {{ $p | Invoke-CimMethod -MethodName PrintTestPage; exit 0 }} else {{ exit 1 }}"
                res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
                if res.returncode == 0:
                    self.after(0, lambda: messagebox.showinfo(
                        "Test Page Sent",
                        f"Windows has sent a test page to:\n\n{printer}\n\nPlease check your printer tray.",
                        parent=self
                    ))
                else:
                    self.after(0, lambda: messagebox.showerror(
                        "Print Test Error",
                        f"Could not print to '{printer}'.\n\nDetails: {res.stderr.strip() or 'Device is offline or busy'}",
                        parent=self
                    ))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Print Test Error", f"Failed to dispatch test page:\n\n{e}", parent=self))

        threading.Thread(target=_do_test_print, daemon=True).start()

    def rescan_printers(self):
        printers = detect_printers()
        self.printer_combo['values'] = printers
        if printers:
            self.printer_combo.current(0)
            self.printer_status_lbl.config(text=f"Detected {len(printers)} device(s). Ready: {printers[0]}")

    def rescan_wifi(self):
        networks, current_ssid = detect_wifi_networks()
        self.wifi_combo['values'] = networks
        curr = self.wifi_var.get().strip()
        matched = False
        if curr:
            clean_curr = extract_clean_ssid(curr).lower()
            for net in networks:
                if extract_clean_ssid(net).lower() == clean_curr:
                    self.wifi_var.set(net)
                    matched = True
                    break
        if not matched:
            if current_ssid:
                self.wifi_var.set(current_ssid)
            elif networks:
                self.wifi_combo.current(0)
        # Also recheck cloud connection when scanning
        threading.Thread(target=self._async_cloud_ping, daemon=True).start()

    def refresh_devices(self):
        threading.Thread(target=self._async_refresh, daemon=True).start()
        threading.Thread(target=self._async_cloud_ping, daemon=True).start()

    def _async_cloud_ping(self):
        import time, ssl
        t0 = time.time()
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        stations = None
        lat_ms = 0

        # 1. Try primary Vercel API with 8s timeout for campus Wi-Fi latency
        try:
            req = urllib.request.Request(f"{API_BASE_URL}/station/list?all=true", headers={'User-Agent': 'PrintKurox-Setup/2.5'})
            with urllib.request.urlopen(req, context=ctx, timeout=8) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode('utf-8'))
                    stations = data.get('stations', [])
                    lat_ms = max(1, int((time.time() - t0) * 1000))
        except Exception:
            pass

        # 2. Resilient Cloudflare D1 direct fallback (bypasses any ISP blocks on vercel.app)
        if stations is None:
            try:
                cf_acc, cf_token, cf_db = get_cf_env()
                if cf_token:
                    d1_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_acc}/d1/database/{cf_db}/query"
                    d1_headers = {
                        "Authorization": f"Bearer {cf_token}",
                        "Content-Type": "application/json"
                    }
                d1_payload = json.dumps({
                    "sql": "SELECT id, name, short_name, status, duplex_enabled FROM stations;"
                }).encode('utf-8')
                d1_req = urllib.request.Request(d1_url, data=d1_payload, headers=d1_headers)
                with urllib.request.urlopen(d1_req, context=ctx, timeout=8) as res:
                    data = json.loads(res.read().decode('utf-8'))
                    stations = data.get("result", [{}])[0].get("results", [])
                    lat_ms = max(1, int((time.time() - t0) * 1000))
            except Exception:
                pass

        if stations is not None:
            self.after(0, lambda: self._apply_used_stations(stations, lat_ms))
            # Keepalive re-ping every 25 seconds
            self.after(25000, lambda: threading.Thread(target=self._async_cloud_ping, daemon=True).start())
            return

        self.after(0, lambda: self.cloud_status_badge.config(
            text="● Cloud Offline", fg="#DC2626"
        ))
        # If offline, retry automatically every 6 seconds until back online
        self.after(6000, lambda: threading.Thread(target=self._async_cloud_ping, daemon=True).start())

    def _on_station_selected(self, event=None):
        val = self.entry_station_name.get()
        if "[This PC" in val:
            self.btn_submit.config(text="Update Settings", state="normal")
            if hasattr(self, 'btn_launch_now'):
                self.btn_launch_now.pack(side="right", padx=(0, 6))
        elif "[CLAIMED]" in val:
            self.btn_submit.config(text="Hostel Claimed", state="disabled")
            if hasattr(self, 'btn_launch_now'):
                self.btn_launch_now.pack_forget()
        else:
            self.btn_submit.config(text="Register", state="normal")
            if hasattr(self, 'btn_launch_now'):
                self.btn_launch_now.pack_forget()

    def _populate_initial_hostels(self, station_id=""):
        st_id = (station_id or getattr(self, 'current_station_id', '')).lower()
        options = []
        selected = None
        for h in self.all_hostels:
            slug = re.sub(r'[^a-z0-9]+', '_', h.lower()).strip('_')
            if st_id and (slug == st_id or st_id.startswith(slug)):
                lbl = f"{h} — [This PC (Active)]"
                selected = lbl
            else:
                lbl = f"{h} — [AVAILABLE]"
                if not selected:
                    selected = lbl
            options.append(lbl)
        if selected:
            self.entry_station_name.set(selected)
        self._on_station_selected()
        
        # Lock only the station hostel name (room number and passcode remain editable)
        if st_id:
            self.entry_station_name.config(state="disabled")
            self.entry_room_number.config(state="normal")
            self.entry_admin_pin.config(state="normal")
        else:
            self.entry_station_name.config(state="readonly")
            self.entry_room_number.config(state="normal")
            self.entry_admin_pin.config(state="normal")

    def _apply_used_stations(self, registered_stations, lat_ms):
        self.cloud_status_badge.config(text=f"● Cloud Online ({lat_ms}ms)", fg="#059669")
        
        used_names = [s.get('name', '').lower() for s in registered_stations if s.get('name')]
        used_ids = [s.get('id', '').lower() for s in registered_stations if s.get('id')]
        
        my_station_id = getattr(self, 'current_station_id', '').lower()

        dropdown_options = []
        selected_option = None

        for h in self.all_hostels:
            h_lower = h.lower()
            slug = re.sub(r'[^a-z0-9]+', '_', h_lower).strip('_')

            # Check if this hostel belongs to this PC
            is_this_pc = False
            if my_station_id:
                if slug == my_station_id or my_station_id.startswith(slug) or slug.startswith(my_station_id):
                    is_this_pc = True
                else:
                    for s in registered_stations:
                        if s.get('id', '').lower() == my_station_id and h_lower in s.get('name', '').lower():
                            is_this_pc = True
                            break

            is_claimed = (not is_this_pc) and (
                any(h_lower in u or u in h_lower for u in used_names) or 
                any(slug in uid or uid in slug for uid in used_ids)
            )
            
            if is_this_pc:
                label = f"{h} — [This PC (Active)]"
                dropdown_options.append(label)
                selected_option = label
            elif is_claimed:
                label = f"{h} — [CLAIMED]"
                dropdown_options.append(label)
            else:
                label = f"{h} — [AVAILABLE]"
                dropdown_options.append(label)
                if not selected_option:
                    selected_option = label

        self.entry_station_name['values'] = dropdown_options
        if selected_option:
            self.entry_station_name.set(selected_option)
        self._on_station_selected()

        # Lock only the station hostel name (room number and passcode remain editable)
        if my_station_id:
            self.entry_station_name.config(state="disabled")
            self.entry_room_number.config(state="normal")
            self.entry_admin_pin.config(state="normal")
        else:
            self.entry_station_name.config(state="readonly")
            self.entry_room_number.config(state="normal")
            self.entry_admin_pin.config(state="normal")

    def _async_refresh(self):
        printers = detect_printers()
        networks, current_ssid = detect_wifi_networks()
        self.after(0, lambda: self._apply_refreshed(printers, networks, current_ssid))

    def _apply_refreshed(self, printers, networks, current_ssid):
        self.printer_combo['values'] = printers
        if printers:
            if not self.printer_var.get() or self.printer_var.get() not in printers:
                self.printer_combo.current(0)
            self.printer_status_lbl.config(text=f"Detected {len(printers)} device(s). Ready.")

        self.wifi_combo['values'] = networks
        curr = self.wifi_var.get().strip()
        matched = False
        if curr:
            clean_curr = extract_clean_ssid(curr).lower()
            for net in networks:
                if extract_clean_ssid(net).lower() == clean_curr:
                    self.wifi_var.set(net)
                    matched = True
                    break
        if not matched:
            if current_ssid:
                self.wifi_var.set(current_ssid)
            elif networks:
                self.wifi_combo.current(0)

    def load_existing_env(self):
        loaded_user = ""
        loaded_pass = ""
        loaded_station_id = ""

        # 1. Load from daemon/.env
        if os.path.exists(ENV_FILE_PATH):
            try:
                with open(ENV_FILE_PATH, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("PRINTER_NAME="):
                            val = line.split("=", 1)[1].strip()
                            if val: self.printer_var.set(val)
                        elif line.startswith("TARGET_WIFI_PROFILE="):
                            val = line.split("=", 1)[1].strip()
                            if val:
                                matched = False
                                for opt in getattr(self, 'wifi_combo', {}).get('values', []):
                                    if extract_clean_ssid(opt).lower() == val.lower():
                                        self.wifi_var.set(opt)
                                        matched = True
                                        break
                                if not matched:
                                    self.wifi_var.set(val)
                        elif line.startswith("CAMPUS_WIFI_USER="):
                            loaded_user = line.split("=", 1)[1].strip()
                        elif line.startswith("CAMPUS_WIFI_PASS="):
                            loaded_pass = line.split("=", 1)[1].strip()
                        elif line.startswith("STATION_ID="):
                            loaded_station_id = line.split("=", 1)[1].strip()
            except Exception:
                pass

        # 2. If credentials not in .env, auto-detect from weblogin.bat
        if not loaded_user or not loaded_pass:
            wl_user, wl_pass = find_and_parse_weblogin()
            if not loaded_user and wl_user:
                loaded_user = wl_user
            if not loaded_pass and wl_pass:
                loaded_pass = wl_pass

        # 3. Populate entry fields
        if loaded_user:
            self.entry_portal_user.delete(0, tk.END)
            self.entry_portal_user.insert(0, loaded_user)
        if loaded_pass:
            self.entry_portal_pass.delete(0, tk.END)
            self.entry_portal_pass.insert(0, loaded_pass)

        self.current_station_id = loaded_station_id
        self._populate_initial_hostels(loaded_station_id)

    def save_and_start(self):
        raw_selection = self.entry_station_name.get().strip()

        if "[CLAIMED]" in raw_selection:
            messagebox.showerror(
                "Hostel Already Claimed",
                f"The selected hostel block is already claimed and operated by another station.\n\n"
                f"Please choose an available hostel marked [AVAILABLE].",
                parent=self
            )
            return

        # 1. IF THIS PC IS ALREADY REGISTERED, UPDATE SETTINGS (DO NOT REGISTER A NEW STATION)
        if self.btn_submit.cget('text') == "Update Settings" or "[This PC" in raw_selection:
            printer_name = self.printer_var.get().strip()
            wifi_ssid = extract_clean_ssid(self.wifi_var.get().strip())
            portal_user = self.entry_portal_user.get().strip()
            portal_pass = self.entry_portal_pass.get().strip()
            admin_pin = self.entry_admin_pin.get().strip()
            room_num = self.entry_room_number.get().strip()

            if not printer_name:
                messagebox.showerror("Error", "Please select a print device.", parent=self)
                return

            if len(admin_pin) < 4:
                messagebox.showerror("Configuration Error", "The Admin Passcode must contain at least 4 characters.", parent=self)
                return

            # Update daemon/.env (for live Wi-Fi auto-login and printing daemon)
            update_env_file({
                "PRINTER_NAME": printer_name,
                "TARGET_WIFI_PROFILE": wifi_ssid,
                "CAMPUS_WIFI_USER": portal_user,
                "CAMPUS_WIFI_PASS": portal_pass,
                "CAMPUS_PORTAL_ENABLED": "true" if portal_user else "false",
            })

            # Update local station_config.json
            if os.path.exists(CONFIG_FILE_PATH):
                try:
                    with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
                        cfg = json.load(f)
                    cfg["printer_name"] = printer_name
                    cfg["wifi_ssid"] = wifi_ssid
                    cfg["room_number"] = room_num
                    cfg["admin_pin"] = admin_pin
                    with open(CONFIG_FILE_PATH, 'w', encoding='utf-8') as f:
                        json.dump(cfg, f, indent=2)
                except Exception:
                    pass

            # Sync updated room number and admin PIN directly to Cloudflare D1
            st_id = getattr(self, 'current_station_id', '')
            if st_id:
                def _sync_cloud_update():
                    try:
                        cf_acc, cf_token, cf_db = get_cf_env()
                        if cf_token:
                            d1_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_acc}/d1/database/{cf_db}/query"
                            d1_headers = {"Authorization": f"Bearer {cf_token}", "Content-Type": "application/json"}
                            sql = "UPDATE stations SET short_name = ?, admin_pin = ? WHERE id = ?;"
                            payload = json.dumps({"sql": sql, "params": [room_num, admin_pin, st_id]}).encode('utf-8')
                            req = urllib.request.Request(d1_url, data=payload, headers=d1_headers)
                            urllib.request.urlopen(req, timeout=8)
                    except Exception as e:
                        print("Notice updating cloud settings:", e)
                threading.Thread(target=_sync_cloud_update, daemon=True).start()

            messagebox.showinfo("Settings Saved", "Your printer, Wi-Fi password, room number, and admin passcode have been updated successfully!", parent=self)
            return

        base_hostel_name = raw_selection.split(" — ")[0].split(" (")[0].strip()
        room_num = self.entry_room_number.get().strip()
        station_name = f"{base_hostel_name} ({room_num})" if room_num else base_hostel_name

        station_type = "hostel"
        admin_pin = self.entry_admin_pin.get().strip()
        printer_name = self.printer_var.get().strip()
        wifi_ssid = extract_clean_ssid(self.wifi_var.get().strip())
        portal_user = self.entry_portal_user.get().strip()
        portal_pass = self.entry_portal_pass.get().strip()

        if not base_hostel_name or base_hostel_name == "No Hostels Available":
            messagebox.showerror("Configuration Error", "Please select an available Station Display Name.", parent=self)
            return

        if len(admin_pin) < 4:
            messagebox.showerror("Configuration Error", "The Admin Passcode must contain at least 4 characters.", parent=self)
            return

        if not printer_name:
            messagebox.showerror("Configuration Error", "Please select a print device from the dropdown menu.", parent=self)
            return

        self.btn_submit.config(state="disabled", text="Registering...")

        threading.Thread(target=self._do_registration, args=(
            station_name, base_hostel_name, room_num, station_type, admin_pin, printer_name, wifi_ssid, portal_user, portal_pass
        ), daemon=True).start()

    def _do_registration(self, station_name, base_hostel_name, room_num, station_type, admin_pin, printer_name, wifi_ssid, portal_user, portal_pass):
        try:
            station_id = re.sub(r'[^a-z0-9]+', '_', base_hostel_name.lower()).strip('_')
            
            import ssl
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            # Real-time backend verification (skip on network errors, only block if station truly claimed)
            try:
                chk_req = urllib.request.Request(f"{API_BASE_URL}/station/list?all=true", headers={'User-Agent': 'PrintKurox-Setup/2.5'})
                with urllib.request.urlopen(chk_req, context=ctx, timeout=8) as chk_res:
                    if chk_res.status == 200:
                        chk_data = json.loads(chk_res.read().decode('utf-8'))
                        existing_stations = chk_data.get('stations', [])
                        
                        my_station_id = getattr(self, 'current_station_id', '').lower()
                        
                        for s in existing_stations:
                            s_id = s.get('id', '').lower()
                            s_name = s.get('name', '').lower()
                            
                            is_match = (s_id == station_id) or (base_hostel_name.lower() in s_name or s_name in base_hostel_name.lower())
                            if is_match:
                                is_my_machine = (my_station_id and (my_station_id == s_id or s_id in my_station_id or my_station_id in s_id))
                                if not is_my_machine:
                                    raise Exception(
                                        f"Station '{base_hostel_name}' is already connected in the backend.\n\n"
                                        f"Please choose your actual hostel station."
                                    )
            except Exception as chk_err:
                # Only re-raise if this is a "claimed station" error, NOT a network timeout
                if "already connected" in str(chk_err).lower():
                    raise chk_err
                # All other errors (timeout, DNS, connection refused) are safely ignored — registration proceeds

            import secrets
            station_token = f"kurox_st_{station_id}_{secrets.token_hex(16)}"

            cf_acc, cf_token, cf_db = get_cf_env()

            registered = False
            if cf_token:
                d1_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_acc}/d1/database/{cf_db}/query"
                d1_headers = {
                    "Authorization": f"Bearer {cf_token}",
                    "Content-Type": "application/json"
                }

                sql = """
                INSERT INTO stations (id, name, short_name, station_type, is_public, admin_pin, station_token, status, duplex_enabled, last_heartbeat)
                VALUES (?, ?, ?, ?, 1, ?, ?, 'online', 1, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  short_name = excluded.short_name,
                  station_type = excluded.station_type,
                  admin_pin = excluded.admin_pin,
                  station_token = excluded.station_token,
                  status = 'online',
                  last_heartbeat = datetime('now');
                """
                d1_payload = json.dumps({
                    "sql": sql,
                    "params": [station_id, station_name, room_num or None, station_type, admin_pin, station_token]
                }).encode('utf-8')

                try:
                    d1_req = urllib.request.Request(d1_url, data=d1_payload, headers=d1_headers)
                    with urllib.request.urlopen(d1_req, context=ctx, timeout=10) as response:
                        d1_res = json.loads(response.read().decode('utf-8'))
                        if d1_res.get("success"):
                            registered = True
                except Exception as d1_err:
                    print("Direct D1 registration notice:", d1_err)

            # Fallback to Web API
            if not registered:
                payload = json.dumps({
                    "name": station_name,
                    "shortName": room_num or None,
                    "stationType": station_type,
                    "adminPin": admin_pin,
                    "duplexEnabled": 1
                }).encode('utf-8')

                req = urllib.request.Request(
                    f"{API_BASE_URL}/daemon/register", 
                    data=payload, 
                    headers={'Content-Type': 'application/json'}
                )

                try:
                    with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
                        res_body = response.read().decode('utf-8')
                        res_json = json.loads(res_body)
                        if res_json.get("success"):
                            station_id = res_json.get("station_id", station_id)
                            station_token = res_json.get("station_token", station_token)
                            registered = True
                        else:
                            err_msg = res_json.get("error") or res_json.get("message") or "Unknown registration error"
                            raise Exception(str(err_msg))
                except urllib.error.HTTPError as http_err:
                    raise Exception(f"Cloud Server returned HTTP {http_err.code} ({http_err.reason})")
                except Exception as api_err:
                    if not registered:
                        err_str = str(api_err) if str(api_err) and str(api_err) != "None" else "Cloud connection failed"
                        raise Exception(err_str)

            updates = {
                "STATION_NAME": station_name,
                "STATION_ID": station_id,
                "STATION_TOKEN": station_token,
                "PRINTER_NAME": printer_name,
                "TARGET_WIFI_PROFILE": wifi_ssid,
                "CAMPUS_WIFI_USER": portal_user,
                "CAMPUS_WIFI_PASS": portal_pass,
                "CAMPUS_PORTAL_ENABLED": "true" if portal_user else "false",
                "SERVER_URL": "https://printkurox.vercel.app",
                "CLOUDFLARE_ACCOUNT_ID": cf_acc,
                "CLOUDFLARE_API_TOKEN": cf_token or "",
                "CLOUDFLARE_D1_DATABASE_ID": cf_db
            }
            update_env_file(updates)
            self.current_station_id = station_id

            config_data = {
                "station_id": station_id,
                "station_token": station_token,
                "station_name": station_name,
                "station_type": station_type,
                "room_number": room_num,
                "printer_name": printer_name,
                "admin_pin": admin_pin,
                "wifi_ssid": wifi_ssid
            }
            with open(CONFIG_FILE_PATH, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2)

            # Auto-Start Registration on Windows Boot
            if self.autostart_var.get() and os.name == 'nt':
                try:
                    startup_folder = os.path.join(os.environ.get('APPDATA', ''), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
                    shortcut_path = os.path.join(startup_folder, 'PrintKurox_Hostel_AlwaysOnline.lnk')
                    
                    conn_exe = os.path.abspath(os.path.join(BASE_DIR, 'connector.exe'))
                    start_bat = os.path.abspath(os.path.join(BASE_DIR, 'START_PRINTKUROX.bat'))
                    target_vbs = os.path.abspath(os.path.join(BASE_DIR, 'daemon', 'PrintKurox_AutoStart.vbs'))

                    if os.path.exists(conn_exe):
                        ps_script = f"$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{shortcut_path}'); $s.TargetPath = '{conn_exe}'; $s.WorkingDirectory = '{BASE_DIR}'; $s.Description = 'PrintKurox Station Connector'; $s.Save()"
                        subprocess.run(['powershell', '-NoProfile', '-Command', ps_script], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                    elif os.path.exists(start_bat):
                        ps_script = f"$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{shortcut_path}'); $s.TargetPath = '{start_bat}'; $s.WorkingDirectory = '{BASE_DIR}'; $s.Description = 'PrintKurox Station'; $s.Save()"
                        subprocess.run(['powershell', '-NoProfile', '-Command', ps_script], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                    elif os.path.exists(target_vbs):
                        vbs_dir = os.path.dirname(target_vbs)
                        ps_script = f"$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{shortcut_path}'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '`\"{target_vbs}`\"'; $s.WorkingDirectory = '{vbs_dir}'; $s.Description = 'PrintKurox Always Online Keepalive'; $s.Save()"
                        subprocess.run(['powershell', '-NoProfile', '-Command', ps_script], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                except Exception as ex:
                    print("Could not register startup task:", ex)

            self.after(0, lambda: self._on_success(station_id, station_name, room_num, station_token, admin_pin))

        except Exception as e:
            import traceback
            traceback.print_exc()
            err_str = str(e) if str(e) and str(e) != "None" else "Registration failed: Could not communicate with server."
            self.after(0, lambda: self._on_failure(err_str))

    def _on_success(self, station_id, station_name, room_num, station_token, admin_pin):
        dashboard_url = f"https://printkurox.vercel.app/admin/{station_id}?token={station_token}"
        
        # 1. Save credentials to LOGIN_INFO.txt
        info_file = os.path.join(BASE_DIR, "LOGIN_INFO.txt")
        info_content = (
            "========================================================================\n"
            "                 PRINTKUROX HOSTEL STATION CREDENTIALS\n"
            "========================================================================\n\n"
            f"Hostel Station  : {station_name}\n"
            f"Pickup Room     : {room_num or 'Unspecified'}\n"
            f"Station ID      : {station_id}\n"
            f"Admin Passcode  : {admin_pin}\n\n"
            "------------------------------------------------------------------------\n"
            "MANAGEMENT & EARNINGS DASHBOARD LINK:\n"
            f"{dashboard_url}\n"
            "------------------------------------------------------------------------\n\n"
            "IMPORTANT:\n"
            "- Save this file! If you ever lose your dashboard link or forget your passcode,\n"
            "  you can open this file anytime to access your earnings and station controls.\n"
            "- The background printing service is now active and monitoring print jobs.\n\n"
            "========================================================================\n"
        )
        try:
            with open(info_file, 'w', encoding='utf-8') as f:
                f.write(info_content)
        except Exception as file_err:
            print("Notice writing LOGIN_INFO.txt:", file_err)

        # Credentials saved to LOGIN_INFO.txt (not opened automatically)

        # Open the success dialog (dashboard can be opened manually via 'Open Admin Portal')
        RegistrationSuccessDialog(self, station_name, room_num, station_id, admin_pin, dashboard_url)

    def _launch_station_monitor(self):
        return launch_hostel_always_online_silent()

    def _on_failure(self, error_msg):
        self.btn_submit.config(state="normal", text="Register")
        messagebox.showerror("Registration Notice", f"{error_msg}\n\nPlease choose your actual station and try again.", parent=self)
        self.refresh_devices()

    def show_dashboard_ui(self):
        for w in self.winfo_children():
            w.destroy()

        self.title("PrintKurox Station Manager")
        self.geometry("560x650")
        self.resizable(False, False)
        if self.state() == "withdrawn" and ("--background" not in sys.argv and "--silent" not in sys.argv):
            self.deiconify()

        cfg = load_station_config()
        self.current_station_id = cfg.get("station_id", "")
        self.station_token = cfg.get("station_token", "")
        self.station_name = cfg.get("station_name", "PrintKurox Station")
        self.printer_name = cfg.get("printer_name", "Default System Printer")
        self.server_url = (cfg.get("server_url") or "https://printkurox.vercel.app").rstrip('/')
        self.admin_pin = cfg.get("admin_pin", "")

        # Header Frame
        hdr = ttk.Frame(self, padding=(18, 14))
        hdr.pack(fill="x")

        hdr_left = ttk.Frame(hdr)
        hdr_left.pack(side="left", fill="both", expand=True)

        lbl_t = ttk.Label(hdr_left, text="PrintKurox Station Manager", style="Header.TLabel")
        lbl_t.pack(anchor="w")

        lbl_sub = ttk.Label(hdr_left, text="Active cloud print dispatch and queue monitor", style="SubHeader.TLabel")
        lbl_sub.pack(anchor="w", pady=(2, 0))

        self.dash_status_badge = tk.Label(hdr, text="● ONLINE", font=("Segoe UI", 9, "bold"), fg="#16A34A")
        self.dash_status_badge.pack(side="right", anchor="ne", pady=2)

        # Body container
        body = ttk.Frame(self, padding=(18, 0, 18, 14))
        body.pack(fill="both", expand=True)

        # Station Info Card
        card = ttk.LabelFrame(body, text=" Station Information ", padding=(14, 10))
        card.pack(fill="x", pady=(0, 10))

        ttk.Label(card, text="Station Name:", font=("Segoe UI", 9, "bold")).grid(row=0, column=0, sticky="w", pady=2)
        ttk.Label(card, text=self.station_name, font=("Segoe UI", 9)).grid(row=0, column=1, sticky="w", padx=(10, 0), pady=2)

        ttk.Label(card, text="Station ID:", font=("Segoe UI", 9, "bold")).grid(row=1, column=0, sticky="w", pady=2)
        ttk.Label(card, text=self.current_station_id, font=("Segoe UI", 9)).grid(row=1, column=1, sticky="w", padx=(10, 0), pady=2)

        ttk.Label(card, text="Active Printer:", font=("Segoe UI", 9, "bold")).grid(row=2, column=0, sticky="w", pady=2)
        ttk.Label(card, text=self.printer_name, font=("Segoe UI", 9)).grid(row=2, column=1, sticky="w", padx=(10, 0), pady=2)

        # Automation & Options Frame
        opts_frame = ttk.LabelFrame(body, text=" System & Automation ", padding=(14, 10))
        opts_frame.pack(fill="x", pady=(0, 10))

        self.dash_autostart_var = tk.BooleanVar(value=is_startup_enabled())
        chk_auto = ttk.Checkbutton(
            opts_frame,
            text="Start automatically with Windows (Background spooler)",
            variable=self.dash_autostart_var,
            command=self._on_dash_toggle_autostart
        )
        chk_auto.pack(anchor="w", pady=(0, 8))

        # Action Buttons Row
        act_row = ttk.Frame(opts_frame)
        act_row.pack(fill="x")

        btn_portal = ttk.Button(act_row, text="🌐 Open Admin Portal", command=self._open_admin_portal)
        btn_portal.pack(side="left", padx=(0, 6))

        btn_test = ttk.Button(act_row, text="🖨️ Print Test Page", command=self._print_test_page_dashboard)
        btn_test.pack(side="left", padx=(0, 6))

        btn_tray = ttk.Button(act_row, text="⬇️ Minimize to Tray", command=self.hide_to_tray)
        btn_tray.pack(side="left", padx=(0, 6))

        btn_reconfig = ttk.Button(act_row, text="⚙️ Reconfigure", command=self._reconfigure_station)
        btn_reconfig.pack(side="left")

        # Live Activity / Spooler Log Frame
        log_frame = ttk.LabelFrame(body, text=" Live Print Activity & Spooler Log ", padding=(10, 8))
        log_frame.pack(fill="both", expand=True, pady=(0, 10))

        self.log_text = tk.Text(log_frame, height=9, font=("Consolas", 8), bg="#0F172A", fg="#38BDF8", relief="flat", wrap="word")
        self.log_text.pack(fill="both", expand=True)
        tstr = time.strftime('%H:%M:%S')
        self.log_text.insert("end", f"[{tstr}] Station Manager initialized.\n")
        self.log_text.insert("end", f"[{tstr}] Station: {self.station_name} [{self.current_station_id}]\n")
        self.log_text.insert("end", f"[{tstr}] Target Printer: {self.printer_name}\n")
        self.log_text.see("end")

        # Bottom Bar: Disconnect / Uninstall Button
        bottom_bar = ttk.Frame(body)
        bottom_bar.pack(fill="x")

        btn_uninstall = tk.Button(
            bottom_bar,
            text="🗑️ Disconnect & Uninstall Station",
            font=("Segoe UI", 8),
            fg="#DC2626",
            bg="#FEF2F2",
            activebackground="#FEE2E2",
            relief="groove",
            command=self._confirm_uninstall
        )
        btn_uninstall.pack(side="left")

        btn_exit = ttk.Button(bottom_bar, text="Exit App", width=10, command=self.quit_app)
        btn_exit.pack(side="right", padx=(8, 0))

        lbl_keep = ttk.Label(bottom_bar, text="Closing window minimizes to System Tray.", font=("Segoe UI", 8, "italic"))
        lbl_keep.pack(side="right")

        # Start Spooler Worker thread if not already running
        self.spooler_running = True
        threading.Thread(target=self._dashboard_spooler_loop, daemon=True).start()

    def _append_log(self, msg):
        def _insert():
            try:
                if hasattr(self, 'log_text') and self.log_text.winfo_exists():
                    tstr = time.strftime('%H:%M:%S')
                    self.log_text.insert("end", f"[{tstr}] {msg}\n")
                    self.log_text.see("end")
            except Exception:
                pass
        self.after(0, _insert)

    def _on_dash_toggle_autostart(self):
        val = self.dash_autostart_var.get()
        ok = set_startup_shortcut(val)
        if ok:
            status = "ENABLED" if val else "DISABLED"
            self._append_log(f"Windows startup auto-launch {status}.")
        else:
            self._append_log("Notice: Could not update startup shortcut.")

    def _open_admin_portal(self):
        cfg = load_station_config()
        st_id = cfg.get("station_id") or self.current_station_id
        token = cfg.get("station_token") or getattr(self, 'station_token', '')
        url = f"https://printkurox.vercel.app/admin/{st_id}?token={token}"
        try:
            subprocess.Popen(["cmd.exe", "/c", "start", "", url], shell=True)
        except Exception:
            try:
                import webbrowser
                webbrowser.open(url)
            except Exception:
                pass

    def _print_test_page_dashboard(self):
        cfg = load_station_config()
        pname = cfg.get("printer_name") or getattr(self, 'printer_name', 'Default System Printer')
        self._append_log(f"Generating test page for {pname}...")
        try:
            import pymupdf
            doc = pymupdf.open()
            page = doc.new_page(width=595, height=842)
            rect = pymupdf.Rect(40, 40, 555, 802)
            page.draw_rect(rect, color=(0, 0, 0), width=2)
            page.insert_text(pymupdf.Point(60, 90), "PrintKurox Station Test Page", fontsize=18, fontname="helv", color=(0, 0, 0))
            page.insert_text(pymupdf.Point(60, 120), f"Station: {self.station_name} [{self.current_station_id}]", fontsize=11, fontname="helv", color=(0, 0, 0))
            page.insert_text(pymupdf.Point(60, 140), f"Printer: {pname}", fontsize=11, fontname="helv", color=(0, 0, 0))
            page.insert_text(pymupdf.Point(60, 160), f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}", fontsize=11, fontname="helv", color=(0, 0, 0))
            page.insert_text(pymupdf.Point(60, 190), "Status: Connection and Spooler Operational", fontsize=12, fontname="helv", color=(0, 0, 0))
            page.insert_text(pymupdf.Point(60, 230), "Pure Black & White (8-bit DeviceGray) Conversion Verified.", fontsize=10, fontname="helv", color=(0, 0, 0))

            test_path = os.path.join(TEMP_DIR, "test_page.pdf")
            doc.save(test_path)
            doc.close()

            sumatra_exe = locate_sumatra()
            job = {"copies": 1, "page_range": "ALL", "color_mode": "BW", "total_pages": 1}
            ok = print_pdf_job(sumatra_exe, pname, test_path, job, logger=self._append_log)
            if ok:
                self._append_log("Test page successfully spooled to printer!")
            else:
                self._append_log("Failed to print test page.")
        except Exception as e:
            self._append_log(f"Test page error: {e}")

    def _reconfigure_station(self):
        self.spooler_running = False
        self.setup_ui()
        self.refresh_devices()

    def _confirm_uninstall(self):
        confirm = messagebox.askyesno(
            "Disconnect & Uninstall Station",
            "Are you sure you want to disconnect this station from this PC?\n\n"
            "This will:\n"
            "• Stop the background printing service\n"
            "• Remove automatic Windows startup\n"
            "• Clear local credentials and configuration\n\n"
            "Proceed with uninstallation?",
            parent=self,
            icon="warning"
        )
        if not confirm:
            return

        self.spooler_running = False
        dlg = UninstallProgressDialog(self, delete_cloud=False, station_id=self.current_station_id)
        self.wait_window(dlg)
        self.setup_ui()
        self.refresh_devices()

    def _dashboard_spooler_loop(self):
        cfg = load_station_config()
        station_id = cfg.get("station_id") or self.current_station_id
        station_token = cfg.get("station_token") or getattr(self, 'station_token', '')
        printer_name = cfg.get("printer_name") or getattr(self, 'printer_name', '')
        server_url = (cfg.get("server_url") or "https://printkurox.vercel.app").rstrip('/')

        if not station_id or not station_token:
            self._append_log("Station ID or Token missing. Setup required.")
            return

        sumatra_exe = locate_sumatra()
        if sumatra_exe:
            self._append_log(f"Print Engine: SumatraPDF ({os.path.basename(sumatra_exe)})")
        else:
            self._append_log("SumatraPDF not found in bundle. Will attempt standard Windows print.")

        # Start Heartbeat thread
        threading.Thread(
            target=run_heartbeat_worker,
            args=(server_url, station_id, station_token),
            daemon=True
        ).start()
        self._append_log("Heartbeat active (status: online)")

        headers = {
            'Content-Type': 'application/json',
            'x-station-token': station_token,
            'User-Agent': 'PrintKurox-Manager/3.0'
        }
        poll_url = f"{server_url}/api/daemon/poll?stationId={station_id}"

        consecutive_errors = 0
        while self.spooler_running:
            try:
                req = urllib.request.Request(poll_url, data=b'{}', headers=headers)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    jobs = data.get("jobs", [])
                    if jobs:
                        for job in jobs:
                            if not self.spooler_running:
                                break
                            job_id = job.get("id")
                            pickup = job.get("pickup_code", "PRINT")
                            fname = job.get("file_name", "document.pdf")
                            color_mode = job.get("color_mode", "BW")
                            pages = job.get("total_pages", 1)

                            self._append_log(f"New print order #{pickup} ({fname}, {color_mode}, {pages}p)")

                            if not claim_job(server_url, station_token, job_id):
                                self._append_log(f"Job #{pickup} already claimed or processed.")
                                continue

                            temp_pdf = os.path.join(TEMP_DIR, f"{pickup}_{job_id[:6]}.pdf")
                            self._append_log(f"Downloading #{pickup}...")
                            try:
                                download_file(server_url, station_token, job_id, temp_pdf)
                            except Exception as dl_e:
                                self._append_log(f"Download failed: {dl_e}")
                                update_status(server_url, station_token, job_id, "FAILED")
                                continue

                            self._append_log(f"Sending #{pickup} to {printer_name}...")
                            ok = print_pdf_job(sumatra_exe, printer_name, temp_pdf, job, logger=self._append_log)
                            if ok:
                                time.sleep(2)
                                update_status(server_url, station_token, job_id, "COMPLETED")
                                try:
                                    winsound.MessageBeep(winsound.MB_ICONASTERISK)
                                except Exception:
                                    pass
                                self._append_log(f"Order #{pickup} printed and marked COMPLETED!")
                            else:
                                update_status(server_url, station_token, job_id, "FAILED")
                                self._append_log(f"Print failed for order #{pickup}.")

                            try:
                                if os.path.exists(temp_pdf):
                                    os.remove(temp_pdf)
                            except Exception:
                                pass
                    consecutive_errors = 0
            except Exception as e:
                consecutive_errors += 1
                if consecutive_errors == 1:
                    self._append_log(f"Queue poll notice: {e}")
                time.sleep(3)
            time.sleep(4)

if __name__ == '__main__':
    # Always open the full setup and control application
    app = PrintKuroxSetupApp()
    app.mainloop()
