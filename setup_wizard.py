import os
import sys
import json
import re
import subprocess
import threading
import urllib.request
import urllib.parse
import tkinter as tk
from tkinter import ttk, messagebox

API_BASE_URL = "https://printkurox.vercel.app/api"
ENV_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "daemon", ".env")
CONFIG_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "station_config.json")
ICON_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app_icon.ico")

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
    except Exception as e:
        return ["Default System Printer"]

def detect_wifi_networks():
    """Queries netsh for visible Wi-Fi SSIDs and currently active interface profile."""
    networks = []
    current_ssid = ""
    try:
        res_int = subprocess.run(['netsh', 'wlan', 'show', 'interfaces'], capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        curr = re.findall(r'^\s*SSID\s+:\s+(.*)', res_int.stdout, re.MULTILINE)
        if curr and curr[0].strip():
            current_ssid = curr[0].strip()

        res_net = subprocess.run(['netsh', 'wlan', 'show', 'networks'], capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        ssids = re.findall(r'SSID\s+\d+\s+:\s+(.*)', res_net.stdout)
        networks = [s.strip() for s in ssids if s.strip()]

        if current_ssid and current_ssid not in networks:
            networks.insert(0, current_ssid)
    except Exception as e:
        pass

    return networks if networks else ([current_ssid] if current_ssid else ["BLOCK-B"]), current_ssid

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

class PrintKuroxSetupApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PrintKurox Station Configuration Utility")
        self.geometry("540x740")
        self.resizable(False, True)
        self.configure(bg="#F3F4F6")

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
        self.style.configure("TLabel", background="#F3F4F6", foreground="#1F2937")
        self.style.configure("Header.TLabel", font=("Segoe UI", 12, "bold"), foreground="#111827", background="#FFFFFF")
        self.style.configure("SubHeader.TLabel", font=("Segoe UI", 9), foreground="#6B7280", background="#FFFFFF")
        self.style.configure("TLabelframe", background="#FFFFFF", relief="solid", borderwidth=1)
        self.style.configure("TLabelframe.Label", font=("Segoe UI", 9, "bold"), foreground="#1F2937", background="#FFFFFF")

        self.station_type_var = tk.StringVar(value="hostel")
        self.printer_var = tk.StringVar()
        self.wifi_var = tk.StringVar()
        self.autostart_var = tk.BooleanVar(value=True)

        self.setup_ui()
        self.refresh_devices()

    def setup_ui(self):
        # Professional Windows Header Banner
        header_frame = tk.Frame(self, bg="#FFFFFF", height=65, borderwidth=1, relief="solid")
        header_frame.pack(fill="x")
        header_frame.pack_propagate(False)

        header_text_frame = tk.Frame(header_frame, bg="#FFFFFF")
        header_text_frame.pack(side="left", padx=20, pady=10)

        title_lbl = tk.Label(header_text_frame, text="PrintKurox Kiosk Station Setup", font=("Segoe UI", 12, "bold"), fg="#111827", bg="#FFFFFF")
        title_lbl.pack(anchor="w")

        subtitle_lbl = tk.Label(header_text_frame, text="Configure automated printer dispatch, campus connectivity, and station security.", font=("Segoe UI", 8), fg="#6B7280", bg="#FFFFFF")
        subtitle_lbl.pack(anchor="w")

        # Main Body Frame
        main_frame = tk.Frame(self, bg="#F3F4F6", padx=20, pady=12)
        main_frame.pack(fill="both", expand=True)

        # 1. DEPLOYMENT PROFILE
        grp_type = ttk.LabelFrame(main_frame, text=" Deployment Profile ", padding=(12, 8))
        grp_type.pack(fill="x", pady=(0, 10))

        r1 = tk.Radiobutton(grp_type, text="Hostel Kiosk Station (Autonomous 24/7 with Campus Portal Login)", 
                            variable=self.station_type_var, value="hostel", 
                            font=("Segoe UI", 9), bg="#FFFFFF", activebackground="#FFFFFF",
                            command=self.on_station_type_change)
        r1.pack(anchor="w", pady=2)

        r2 = tk.Radiobutton(grp_type, text="Commercial Print Shop (Manual / Counter Dispatch Station)", 
                            variable=self.station_type_var, value="shop", 
                            font=("Segoe UI", 9), bg="#FFFFFF", activebackground="#FFFFFF",
                            command=self.on_station_type_change)
        r2.pack(anchor="w", pady=2)

        # 2. PRINTER SELECTION
        grp_printer = ttk.LabelFrame(main_frame, text=" Print Device Configuration ", padding=(12, 8))
        grp_printer.pack(fill="x", pady=(0, 10))

        lbl_printer = tk.Label(grp_printer, text="Designated Spooler / Printer:", font=("Segoe UI", 9), fg="#374151", bg="#FFFFFF")
        lbl_printer.pack(anchor="w")

        p_row = tk.Frame(grp_printer, bg="#FFFFFF")
        p_row.pack(fill="x", pady=(3, 3))

        self.printer_combo = ttk.Combobox(p_row, textvariable=self.printer_var, state="readonly", font=("Segoe UI", 9))
        self.printer_combo.pack(side="left", fill="x", expand=True, padx=(0, 8))

        btn_rescan_printer = ttk.Button(p_row, text="Refresh", width=10, command=self.rescan_printers)
        btn_rescan_printer.pack(side="right")

        self.printer_status_lbl = tk.Label(grp_printer, text="Scanning for active USB and network print devices...", font=("Segoe UI", 8), fg="#059669", bg="#FFFFFF")
        self.printer_status_lbl.pack(anchor="w")

        # 3. NETWORK & CAMPUS CONNECTIVITY
        self.grp_wifi = ttk.LabelFrame(main_frame, text=" Network & Authentication ", padding=(12, 8))
        self.grp_wifi.pack(fill="x", pady=(0, 10))

        w_lbl = tk.Label(self.grp_wifi, text="Target Wireless Network (SSID):", font=("Segoe UI", 9), fg="#374151", bg="#FFFFFF")
        w_lbl.pack(anchor="w")

        w_row = tk.Frame(self.grp_wifi, bg="#FFFFFF")
        w_row.pack(fill="x", pady=(3, 6))

        self.wifi_combo = ttk.Combobox(w_row, textvariable=self.wifi_var, font=("Segoe UI", 9))
        self.wifi_combo.pack(side="left", fill="x", expand=True, padx=(0, 8))

        btn_rescan_wifi = ttk.Button(w_row, text="Scan", width=10, command=self.rescan_wifi)
        btn_rescan_wifi.pack(side="right")

        # Portal Credentials Container
        self.portal_frame = tk.Frame(self.grp_wifi, bg="#FFFFFF")
        self.portal_frame.pack(fill="x")

        u_lbl = tk.Label(self.portal_frame, text="Campus Web Portal User ID (Roll Number):", font=("Segoe UI", 9), fg="#374151", bg="#FFFFFF")
        u_lbl.pack(anchor="w", pady=(2, 0))
        self.entry_portal_user = ttk.Entry(self.portal_frame, font=("Segoe UI", 9))
        self.entry_portal_user.pack(fill="x", pady=(2, 6))

        p_lbl = tk.Label(self.portal_frame, text="Campus Web Portal Password:", font=("Segoe UI", 9), fg="#374151", bg="#FFFFFF")
        p_lbl.pack(anchor="w", pady=(2, 0))

        pass_row = tk.Frame(self.portal_frame, bg="#FFFFFF")
        pass_row.pack(fill="x", pady=(2, 4))

        self.entry_portal_pass = ttk.Entry(pass_row, show="*", font=("Segoe UI", 9))
        self.entry_portal_pass.pack(side="left", fill="x", expand=True, padx=(0, 8))

        self.btn_toggle_pass = ttk.Button(pass_row, text="Show", width=8, command=self.toggle_password_visibility)
        self.btn_toggle_pass.pack(side="right")

        self.portal_hint = tk.Label(self.portal_frame, text="Note: The background service uses these credentials to maintain 24/7 internet connectivity.", font=("Segoe UI", 8), fg="#6B7280", bg="#FFFFFF")
        self.portal_hint.pack(anchor="w", pady=(2, 0))

        # 4. STATION IDENTITY
        grp_ident = ttk.LabelFrame(main_frame, text=" Station Identity & Portal Access ", padding=(12, 8))
        grp_ident.pack(fill="x", pady=(0, 10))

        s_name_lbl = tk.Label(grp_ident, text="Station Name (displayed on public catalog):", font=("Segoe UI", 9), fg="#374151", bg="#FFFFFF")
        s_name_lbl.pack(anchor="w")
        self.entry_station_name = ttk.Entry(grp_ident, font=("Segoe UI", 9))
        self.entry_station_name.insert(0, "Hostel Block B (Pare)")
        self.entry_station_name.pack(fill="x", pady=(2, 6))

        pin_lbl = tk.Label(grp_ident, text="Station Admin Passcode (for earnings portal):", font=("Segoe UI", 9), fg="#374151", bg="#FFFFFF")
        pin_lbl.pack(anchor="w")
        self.entry_admin_pin = ttk.Entry(grp_ident, font=("Segoe UI", 9))
        self.entry_admin_pin.insert(0, "1234")
        self.entry_admin_pin.pack(fill="x", pady=(2, 4))

        # Windows Reliability Checkbox
        cb_autostart = tk.Checkbutton(main_frame, text="Register service to start automatically with Windows (Recommended for 24/7 operation)", 
                                      variable=self.autostart_var, font=("Segoe UI", 8), bg="#F3F4F6", activebackground="#F3F4F6")
        cb_autostart.pack(anchor="w", pady=(0, 10))

        # Footer Action Bar
        footer_frame = tk.Frame(main_frame, bg="#F3F4F6")
        footer_frame.pack(fill="x", pady=(0, 5))

        btn_cancel = ttk.Button(footer_frame, text="Cancel", width=12, command=self.destroy)
        btn_cancel.pack(side="right", padx=(8, 0))

        self.btn_submit = tk.Button(footer_frame, text="Save & Start Print Service", 
                                    font=("Segoe UI", 9, "bold"), fg="#FFFFFF", bg="#0066CC", 
                                    activebackground="#0052A3", activeforeground="#FFFFFF",
                                    relief="flat", cursor="hand2", padx=18, pady=7, command=self.save_and_start)
        self.btn_submit.pack(side="right")

        self.load_existing_env()

    def toggle_password_visibility(self):
        if self.entry_portal_pass.cget('show') == '':
            self.entry_portal_pass.config(show='*')
            self.btn_toggle_pass.config(text="Show")
        else:
            self.entry_portal_pass.config(show='')
            self.btn_toggle_pass.config(text="Hide")

    def on_station_type_change(self):
        st = self.station_type_var.get()
        if st == "shop":
            self.portal_frame.pack_forget()
            self.grp_wifi.config(text=" Network Configuration ")
            if self.entry_station_name.get() == "Hostel Block B (Pare)":
                self.entry_station_name.delete(0, tk.END)
                self.entry_station_name.insert(0, "Print Shop (Campus Gate)")
        else:
            self.portal_frame.pack(fill="x")
            self.grp_wifi.config(text=" Network & Authentication ")
            if "Print Shop" in self.entry_station_name.get():
                self.entry_station_name.delete(0, tk.END)
                self.entry_station_name.insert(0, "Hostel Block B (Pare)")

    def rescan_printers(self):
        printers = detect_printers()
        self.printer_combo['values'] = printers
        if printers:
            self.printer_combo.current(0)
            self.printer_status_lbl.config(text=f"Detected {len(printers)} device(s). Selected: {printers[0]}")

    def rescan_wifi(self):
        networks, current_ssid = detect_wifi_networks()
        self.wifi_combo['values'] = networks
        if current_ssid:
            self.wifi_var.set(current_ssid)
        elif networks:
            self.wifi_combo.current(0)

    def refresh_devices(self):
        threading.Thread(target=self._async_refresh, daemon=True).start()

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
        if not self.wifi_var.get():
            if current_ssid:
                self.wifi_var.set(current_ssid)
            elif networks:
                self.wifi_combo.current(0)

    def load_existing_env(self):
        if not os.path.exists(ENV_FILE_PATH):
            return
        try:
            with open(ENV_FILE_PATH, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            for line in lines:
                line = line.strip()
                if line.startswith("PRINTER_NAME="):
                    val = line.split("=", 1)[1]
                    if val: self.printer_var.set(val)
                elif line.startswith("TARGET_WIFI_PROFILE="):
                    val = line.split("=", 1)[1]
                    if val: self.wifi_var.set(val)
                elif line.startswith("CAMPUS_WIFI_USER="):
                    val = line.split("=", 1)[1]
                    self.entry_portal_user.delete(0, tk.END)
                    self.entry_portal_user.insert(0, val)
                elif line.startswith("CAMPUS_WIFI_PASS="):
                    val = line.split("=", 1)[1]
                    self.entry_portal_pass.delete(0, tk.END)
                    self.entry_portal_pass.insert(0, val)
        except Exception as e:
            pass

    def save_and_start(self):
        station_name = self.entry_station_name.get().strip()
        station_type = self.station_type_var.get()
        admin_pin = self.entry_admin_pin.get().strip()
        printer_name = self.printer_var.get().strip()
        wifi_ssid = self.wifi_var.get().strip()
        portal_user = self.entry_portal_user.get().strip()
        portal_pass = self.entry_portal_pass.get().strip()

        if not station_name:
            messagebox.showerror("Configuration Error", "Please specify a Station Display Name.")
            return

        if len(admin_pin) < 4:
            messagebox.showerror("Configuration Error", "The Admin Passcode must contain at least 4 characters.")
            return

        if not printer_name:
            messagebox.showerror("Configuration Error", "Please select a print device from the dropdown menu.")
            return

        self.btn_submit.config(state="disabled", text="Registering...")

        threading.Thread(target=self._do_registration, args=(
            station_name, station_type, admin_pin, printer_name, wifi_ssid, portal_user, portal_pass
        ), daemon=True).start()

    def _do_registration(self, station_name, station_type, admin_pin, printer_name, wifi_ssid, portal_user, portal_pass):
        try:
            # 1. Register via Cloudflare D1 REST API or Web API
            station_id = re.sub(r'[^a-z0-9]+', '_', station_name.lower()).strip('_')
            import secrets
            station_token = f"kurox_st_{station_id}_{secrets.token_hex(16)}"

            env_vars = {}
            if os.path.exists(ENV_FILE):
                try:
                    with open(ENV_FILE, 'r', encoding='utf-8') as ef:
                        for line in ef:
                            if '=' in line and not line.strip().startswith('#'):
                                k, v = line.strip().split('=', 1)
                                env_vars[k.strip()] = v.strip().strip('"').strip("'")
                except Exception:
                    pass

            cf_acc = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or env_vars.get("CLOUDFLARE_ACCOUNT_ID") or "948fd75d8b84a5cf20559d6aa789d4dd"
            cf_token = os.environ.get("CLOUDFLARE_API_TOKEN") or env_vars.get("CLOUDFLARE_API_TOKEN") or ""
            cf_db = os.environ.get("CLOUDFLARE_D1_DATABASE_ID") or env_vars.get("CLOUDFLARE_D1_DATABASE_ID") or "3f4d4547-e86b-4cdd-a867-9ebba19c12c9"

            registered = False
            if cf_token:
                d1_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_acc}/d1/database/{cf_db}/query"
                d1_headers = {
                    "Authorization": f"Bearer {cf_token}",
                    "Content-Type": "application/json"
                }

                sql = """
                INSERT INTO stations (id, name, station_type, is_public, admin_pin, station_token, status, duplex_enabled, last_heartbeat)
                VALUES (?, ?, ?, 1, ?, ?, 'online', 1, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  station_type = excluded.station_type,
                  admin_pin = excluded.admin_pin,
                  station_token = excluded.station_token,
                  status = 'online',
                  last_heartbeat = datetime('now');
                """
                d1_payload = json.dumps({
                    "sql": sql,
                    "params": [station_id, station_name, station_type, admin_pin, station_token]
                }).encode('utf-8')

                try:
                    d1_req = urllib.request.Request(d1_url, data=d1_payload, headers=d1_headers)
                    with urllib.request.urlopen(d1_req, timeout=10) as response:
                        d1_res = json.loads(response.read().decode('utf-8'))
                        if d1_res.get("success"):
                            registered = True
                except Exception as d1_err:
                    print("Direct D1 registration notice:", d1_err)

            # Fallback to Web API if direct D1 is blocked
            if not registered:
                payload = json.dumps({
                    "name": station_name,
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
                    with urllib.request.urlopen(req, timeout=10) as response:
                        res_body = response.read().decode('utf-8')
                        res_json = json.loads(res_body)
                        if res_json.get("success"):
                            station_id = res_json.get("station_id", station_id)
                            station_token = res_json.get("station_token", station_token)
                            registered = True
                        else:
                            raise Exception(res_json.get("error", "Unknown registration error"))
                except urllib.error.HTTPError as http_err:
                    raise Exception(f"Cloud Server returned HTTP {http_err.code} ({http_err.reason})")
                except Exception as api_err:
                    if not registered:
                        raise Exception(f"Connection error: {api_err}")

            updates = {
                "STATION_ID": station_id,
                "STATION_TOKEN": station_token,
                "PRINTER_NAME": printer_name,
                "TARGET_WIFI_PROFILE": wifi_ssid,
                "CAMPUS_WIFI_USER": portal_user,
                "CAMPUS_WIFI_PASS": portal_pass,
                "CAMPUS_PORTAL_ENABLED": "true" if (station_type == "hostel" and portal_user) else "false",
                "SERVER_URL": "https://printkurox.vercel.app"
            }
            update_env_file(updates)

            config_data = {
                "station_id": station_id,
                "station_token": station_token,
                "station_name": station_name,
                "station_type": station_type,
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
                    target_bat = os.path.abspath(os.path.join(os.path.dirname(__file__), 'HOSTEL_ALWAYS_ONLINE.bat'))
                    
                    if os.path.exists(target_bat):
                        ps_script = f"$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{shortcut_path}'); $s.TargetPath = '{target_bat}'; $s.WorkingDirectory = '{os.path.dirname(target_bat)}'; $s.Description = 'PrintKurox Autonomous Background Service'; $s.Save()"
                        subprocess.run(['powershell', '-NoProfile', '-Command', ps_script], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                except Exception as ex:
                    print("Could not register startup task:", ex)

            self.after(0, lambda: self._on_success(station_id, station_name, station_token))

        except Exception as e:
            self.after(0, lambda: self._on_failure(str(e)))

    def _on_success(self, station_id, station_name, station_token):
        import webbrowser
        dashboard_url = f"https://printkurox.vercel.app/admin/{station_id}?token={station_token}"
        msg = (
            f"Configuration Complete\n\n"
            f"Station Name: {station_name}\n"
            f"Station ID: {station_id}\n\n"
            f"Management Portal:\n{dashboard_url}\n\n"
            f"Click OK to launch the print dispatch service and open your management portal."
        )
        messagebox.showinfo("PrintKurox Setup", msg)
        try:
            webbrowser.open(dashboard_url)
        except Exception:
            pass
        self.destroy()

        hostel_bat = os.path.join(os.path.dirname(os.path.abspath(__file__)), "HOSTEL_ALWAYS_ONLINE.bat")
        connector_exe = os.path.join(os.path.dirname(os.path.abspath(__file__)), "connector.exe")

        if os.path.exists(hostel_bat):
            subprocess.Popen([hostel_bat], cwd=os.path.dirname(hostel_bat), shell=True)
        elif os.path.exists(connector_exe):
            subprocess.Popen([connector_exe], cwd=os.path.dirname(connector_exe))

    def _on_failure(self, error_msg):
        self.btn_submit.config(state="normal", text="Save & Start Print Service")
        messagebox.showerror("Setup Error", f"Failed to register station with cloud server:\n\n{error_msg}\n\nPlease check network connectivity and retry.")

if __name__ == '__main__':
    app = PrintKuroxSetupApp()
    app.mainloop()
