import os
import sys
import json
import time
import urllib.request
import urllib.parse
import webbrowser
import threading
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

API_BASE_URL = "https://printkurox.vercel.app/api"
# API_BASE_URL = "http://localhost:3000/api"

ENV_FILE_PATH = os.path.join("daemon", ".env")

HTML_PAGE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PrintKurox Connect Setup</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f9; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .container { background-color: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 500px; width: 100%; }
        h2 { margin-top: 0; color: #333; text-align: center; }
        .form-section { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #eee; }
        .form-section-title { font-size: 14px; font-weight: bold; color: #555; text-transform: uppercase; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; color: #666; font-weight: 500; font-size: 14px;}
        input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 15px; box-sizing: border-box; }
        input:focus { outline: none; border-color: #0070f3; }
        button { width: 100%; padding: 14px; background-color: #000; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background-color 0.2s; }
        button:hover { background-color: #333; }
        .logo { text-align: center; margin-bottom: 20px; font-size: 24px; font-weight: 900; letter-spacing: -1px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">PrintKurox ⚡</div>
        <h2>Hardware Setup Wizard</h2>
        <form id="setup-form" action="/setup" method="POST">
            
            <div class="form-section">
                <div class="form-section-title">1. Station Identity</div>
                <div class="form-group">
                    <label>Station Name (e.g., Hostel Block B)</label>
                    <input type="text" name="station_name" required>
                </div>
                <div class="form-group">
                    <label>Station Type</label>
                    <select name="station_type">
                        <option value="hostel">Hostel Kiosk</option>
                        <option value="shop">Print Shop</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Admin PIN (4-Digits for Dashboard)</label>
                    <input type="text" name="admin_pin" pattern="[0-9]{4}" title="Exactly 4 digits" required>
                </div>
            </div>

            <div class="form-section">
                <div class="form-section-title">2. Hardware & Connectivity</div>
                <div class="form-group">
                    <label>Printer Name in Windows (e.g., EPSON L3210 Series)</label>
                    <input type="text" name="printer_name" value="EPSON L3210 Series" required>
                </div>
                <div class="form-group">
                    <label>Wi-Fi Network SSID (e.g., BLOCK-B)</label>
                    <input type="text" name="wifi_ssid" required>
                </div>
                <div class="form-group">
                    <label>Captive Portal Username (For Hostel Auto-Login)</label>
                    <input type="text" name="portal_user">
                </div>
                <div class="form-group">
                    <label>Captive Portal Password</label>
                    <input type="password" name="portal_pass">
                </div>
            </div>

            <button type="submit">Complete Setup & Start Connector</button>
        </form>
    </div>
</body>
</html>
"""

HTML_SUCCESS = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Setup Complete</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background-color: #f4f4f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .container { background-color: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
        h2 { color: #0070f3; margin-top: 0; }
        p { color: #666; line-height: 1.5; }
        .success-icon { font-size: 48px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h2>Setup Complete!</h2>
        <p>Your hardware is registered and configured.</p>
        <p><strong>Launching your original Connector.exe now...</strong></p>
        <p style="font-size: 13px; color: #999; margin-top: 20px;">You can close this browser window safely.</p>
    </div>
</body>
</html>
"""

def update_env_file(updates):
    """Reads daemon/.env, updates the specified keys, and writes it back."""
    if not os.path.exists(ENV_FILE_PATH):
        print(f"Error: {ENV_FILE_PATH} not found!")
        return

    with open(ENV_FILE_PATH, 'r') as f:
        lines = f.readlines()

    new_lines = []
    for line in lines:
        updated = False
        for key, value in updates.items():
            if line.startswith(f"{key}="):
                new_lines.append(f"{key}={value}\n")
                updated = True
                break
        if not updated:
            new_lines.append(line)

    with open(ENV_FILE_PATH, 'w') as f:
        f.writelines(new_lines)
    print(f"Successfully updated {ENV_FILE_PATH}")

class SetupHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(HTML_PAGE.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/setup':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            params = urllib.parse.parse_qs(post_data)
            
            station_name = params.get('station_name', [''])[0]
            station_type = params.get('station_type', ['hostel'])[0]
            admin_pin = params.get('admin_pin', [''])[0]
            printer_name = params.get('printer_name', [''])[0]
            wifi_ssid = params.get('wifi_ssid', [''])[0]
            portal_user = params.get('portal_user', [''])[0]
            portal_pass = params.get('portal_pass', [''])[0]

            print(f"\n--- Processing Setup for: {station_name} ---")
            
            # 1. Register with the Cloud
            data = json.dumps({
                "name": station_name,
                "stationType": station_type,
                "adminPin": admin_pin,
                "duplexEnabled": 1
            }).encode('utf-8')

            req = urllib.request.Request(f"{API_BASE_URL}/daemon/register", data=data, headers={'Content-Type': 'application/json'})
            
            try:
                with urllib.request.urlopen(req) as response:
                    res_body = response.read().decode('utf-8')
                    res_json = json.loads(res_body)

                    if res_json.get("success"):
                        station_id = res_json["station_id"]
                        station_token = res_json["station_token"]
                        
                        # 2. Overwrite local daemon/.env file
                        updates = {
                            "STATION_ID": station_id,
                            "STATION_TOKEN": station_token,
                            "PRINTER_NAME": printer_name,
                            "TARGET_WIFI_PROFILE": wifi_ssid,
                            "CAMPUS_WIFI_USER": portal_user,
                            "CAMPUS_WIFI_PASS": portal_pass,
                            "CAMPUS_PORTAL_ENABLED": "true" if portal_user else "false"
                        }
                        update_env_file(updates)
                        
                        self.send_response(200)
                        self.send_header("Content-type", "text/html")
                        self.end_headers()
                        self.wfile.write(HTML_SUCCESS.encode('utf-8'))
                        
                        # 3. Stop this setup GUI and launch original connector.exe
                        threading.Thread(target=self.server.shutdown).start()
                    else:
                        self.send_error(500, "Failed to register station with cloud")
            except Exception as e:
                print(f"Error registering: {e}")
                self.send_error(500, "Network error during cloud registration")

def main():
    port = 8080
    server = HTTPServer(('localhost', port), SetupHandler)
    print(f"Starting PrintKurox GUI Setup Wizard...")
    
    # Open the browser to the setup page
    webbrowser.open(f'http://localhost:{port}')
    
    # Wait for the user to submit the form
    server.serve_forever()
    
    # Once the server shuts down (form was submitted successfully), launch the real connector
    print("\nStarting the real connector.exe daemon...")
    if os.path.exists("connector.exe"):
        subprocess.Popen(["connector.exe"])
    else:
        print("connector.exe not found. Please run it manually.")

if __name__ == '__main__':
    main()
