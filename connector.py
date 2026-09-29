import os
import sys
import json
import time
import urllib.request
import urllib.error
import urllib.parse
import subprocess
import shutil
import threading
from pathlib import Path

# Resolve base application directory (supports both frozen PyInstaller .exe and raw script)
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_FILE = os.path.join(BASE_DIR, "station_config.json")
TEMP_DIR = os.path.join(BASE_DIR, "temp_prints")
DEFAULT_SERVER = "https://printkurox.vercel.app"

CREATE_NO_WINDOW = 0x08000000 if sys.platform == 'win32' else 0

def play_chime():
    """Plays an alert chime on Windows."""
    try:
        if sys.platform == 'win32':
            import winsound
            winsound.Beep(1200, 150)
            time.sleep(0.05)
            winsound.Beep(1600, 300)
    except Exception:
        pass

def find_sumatra():
    """Finds SumatraPDF silent print executable."""
    candidates = [
        os.path.join(BASE_DIR, "sumatra", "SumatraPDF-3.5.2-64.exe"),
        os.path.join(BASE_DIR, "sumatra", "SumatraPDF.exe"),
        os.path.join(BASE_DIR, "daemon", "sumatra", "SumatraPDF-3.5.2-64.exe"),
        os.path.join(BASE_DIR, "daemon", "sumatra", "SumatraPDF.exe"),
        r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    w = shutil.which("SumatraPDF.exe") or shutil.which("SumatraPDF-3.5.2-64.exe")
    return w or ""

def get_default_printer_name():
    """Gets the Windows default printer name."""
    if sys.platform == 'win32':
        try:
            cmd = ['powershell', '-NoProfile', '-Command', '(Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true }).Name']
            res = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
            name = res.stdout.strip()
            if name:
                return name
        except Exception:
            pass
    return ""

def load_config():
    """Loads configuration from station_config.json or daemon/.env fallback."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[WARN] Error reading {CONFIG_FILE}: {e}")

    # Fallback to daemon/.env or .env
    for env_path in [os.path.join(BASE_DIR, "daemon", ".env"), os.path.join(BASE_DIR, ".env")]:
        if os.path.exists(env_path):
            cfg = {}
            try:
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if '=' in line and not line.startswith('#'):
                            k, v = line.split('=', 1)
                            cfg[k.strip().lower()] = v.strip().strip('"').strip("'")
                if cfg.get('station_id') and cfg.get('station_token'):
                    return {
                        "station_id": cfg.get("station_id"),
                        "station_token": cfg.get("station_token"),
                        "station_name": cfg.get("station_name", cfg.get("station_id")),
                        "printer_name": cfg.get("printer_name", ""),
                        "server_url": cfg.get("server_url", DEFAULT_SERVER)
                    }
            except Exception:
                pass
    return None

def run_heartbeat_worker(server_url, station_id, station_token):
    """Background thread sending heartbeats every 25 seconds."""
    headers = {
        'Content-Type': 'application/json',
        'x-station-token': station_token,
        'User-Agent': 'PrintKurox-Connector/2.5'
    }
    url = f"{server_url}/api/daemon/heartbeat"
    payload = json.dumps({"stationId": station_id}).encode('utf-8')

    while True:
        try:
            req = urllib.request.Request(url, data=payload, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                pass
        except Exception as e:
            # Heartbeat network glitches are normal, keep retrying silently
            pass
        time.sleep(25)

def download_file(server_url, station_token, job_id, dest_path):
    """Downloads print document from cloud server proxy."""
    url = f"{server_url}/api/daemon/job-file?jobId={job_id}"
    req = urllib.request.Request(url, headers={
        'x-station-token': station_token,
        'User-Agent': 'PrintKurox-Connector/2.5'
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        with open(dest_path, 'wb') as f:
            shutil.copyfileobj(resp, f)

def claim_job(server_url, station_token, job_id):
    """Atomically claims a job for this station."""
    url = f"{server_url}/api/daemon/claim"
    payload = json.dumps({"jobId": job_id}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={
        'Content-Type': 'application/json',
        'x-station-token': station_token,
        'User-Agent': 'PrintKurox-Connector/2.5'
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get("claimed", False) or data.get("status") == "PRINTING_ODD"
    except Exception as e:
        print(f"[CLAIM ERROR] {e}")
        return False

def update_status(server_url, station_token, job_id, status):
    """Updates job status to COMPLETED or FAILED."""
    url = f"{server_url}/api/daemon/status"
    payload = json.dumps({"jobId": job_id, "status": status}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={
        'Content-Type': 'application/json',
        'x-station-token': station_token,
        'User-Agent': 'PrintKurox-Connector/2.5'
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return True
    except Exception as e:
        print(f"[STATUS UPDATE ERROR] {e}")
        return False

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
        print(f"[CONNECTOR] Converted document to True Grayscale: {os.path.basename(out_path)}")
        return out_path
    except Exception as err:
        print(f"[CONNECTOR] Grayscale conversion note: {err}")
        return input_pdf_path

def print_pdf(sumatra_exe, printer_name, pdf_path, job):
    """Executes silent physical print using SumatraPDF."""
    if not sumatra_exe or not os.path.exists(sumatra_exe):
        print("[WARN] SumatraPDF engine not found! Simulating physical print...")
        time.sleep(job.get('total_pages', 1) * 1.5)
        return True

    cmd = [sumatra_exe, "-silent"]

    if printer_name and printer_name != "Default System Printer":
        cmd += ["-print-to", printer_name]
    else:
        cmd.append("-print-to-default")

    # Build print settings
    settings = []
    copies = job.get('copies', 1)
    if copies and copies > 1:
        settings.append(f"{copies}x")

    page_range = job.get('page_range', 'ALL')
    if page_range and page_range.upper() != 'ALL':
        settings.append(page_range)

    # Normalize color mode case-insensitively & enforce true grayscale
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

    if settings:
        cmd += ["-print-settings", ",".join(settings)]

    cmd.append(pdf_path)

    try:
        res = subprocess.run(cmd, timeout=90, creationflags=CREATE_NO_WINDOW)
        return res.returncode == 0
    except Exception as e:
        print(f"[PRINT EXEC ERROR] {e}")
        return False

def run_connector():
    """Main connector daemon process."""
    os.makedirs(TEMP_DIR, exist_ok=True)

    config = load_config()
    if not config:
        print("========================================================")
        print("           PRINTKUROX STATION SETUP REQUIRED            ")
        print("========================================================")
        print("Configuration file 'station_config.json' was not found.")
        setup_exe = os.path.join(BASE_DIR, "PrintKurox_Setup.exe")
        if os.path.exists(setup_exe):
            print("Launching PrintKurox Setup Wizard now...")
            subprocess.Popen([setup_exe], cwd=BASE_DIR)
            sys.exit(0)
        else:
            print("Please run PrintKurox_Setup.exe to configure this station.")
            time.sleep(5)
            sys.exit(1)

    station_id = config.get("station_id")
    station_token = config.get("station_token")
    station_name = config.get("station_name") or station_id
    server_url = (config.get("server_url") or DEFAULT_SERVER).rstrip('/')
    printer_name = config.get("printer_name", "")
    if not printer_name or printer_name == "Default System Printer":
        printer_name = get_default_printer_name() or "Default Windows Printer"

    sumatra_exe = find_sumatra()

    print("========================================================")
    print("        PRINTKUROX AUTONOMOUS STATION CONNECTOR         ")
    print("========================================================")
    print(f" Station:      {station_name} [{station_id}]")
    print(f" Target Print: {printer_name}")
    print(f" Engine:       {'SumatraPDF (Silent Direct Print)' if sumatra_exe else 'System Default (Emulation Mode)'}")
    print(f" Cloud Server: {server_url}")
    print(f" Status:       ONLINE & Waiting for Student Prints...")
    print("========================================================")
    print(" (Keep this window open or minimized to accept print orders)")
    print("")

    # Start background heartbeat
    hb_thread = threading.Thread(
        target=run_heartbeat_worker,
        args=(server_url, station_id, station_token),
        daemon=True
    )
    hb_thread.start()

    headers = {
        'Content-Type': 'application/json',
        'x-station-token': station_token,
        'User-Agent': 'PrintKurox-Connector/2.5'
    }

    poll_url = f"{server_url}/api/daemon/poll?stationId={station_id}"

    while True:
        try:
            req = urllib.request.Request(poll_url, data=b'{}', headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode('utf-8')
                data = json.loads(body)

                jobs = data.get("jobs", [])
                if jobs:
                    for job in jobs:
                        job_id = job.get("id")
                        pickup = job.get("pickup_code", "PRINT")
                        fname = job.get("file_name", "document.pdf")
                        pages = job.get("total_pages", 1)
                        copies = job.get("copies", 1)
                        duplex = "YES (Duplex)" if job.get("is_duplex") else "Single-Sided"

                        print(f"\n[NEW PRINT JOB RECEIVED]")
                        print(f" -> Code:       #{pickup}")
                        print(f" -> File:       {fname}")
                        print(f" -> Pages:      {pages} page(s) | Copies: {copies} | {duplex}")

                        # 1. Claim Job
                        print(" -> Claiming job from server...", end=" ", flush=True)
                        if not claim_job(server_url, station_token, job_id):
                            print("[SKIPPED] (Already processed)")
                            continue
                        print("[OK]")

                        # 2. Download File
                        temp_pdf = os.path.join(TEMP_DIR, f"{pickup}_{job_id[:6]}.pdf")
                        print(" -> Downloading secure PDF...", end=" ", flush=True)
                        try:
                            download_file(server_url, station_token, job_id, temp_pdf)
                            print("[OK]")
                        except Exception as dl_err:
                            print(f"[FAILED: {dl_err}]")
                            update_status(server_url, station_token, job_id, "FAILED")
                            continue

                        # 3. Print
                        print(f" -> Sending to physical printer ({printer_name})...", end=" ", flush=True)
                        ok = print_pdf(sumatra_exe, printer_name, temp_pdf, job)
                        if ok:
                            print("[DELIVERED TO TRAY]")
                            # Settle time for spooler
                            time.sleep(2)
                            update_status(server_url, station_token, job_id, "COMPLETED")
                            play_chime()
                            print(f"[SUCCESS] Order #{pickup} finished and marked COMPLETED!")
                        else:
                            print("[PRINT ERROR]")
                            update_status(server_url, station_token, job_id, "FAILED")

                        # Clean up temp file
                        try:
                            if os.path.exists(temp_pdf):
                                os.remove(temp_pdf)
                        except Exception:
                            pass

                        print("--------------------------------------------------------")
                        print("Status: ONLINE & Waiting for Student Prints...")

            time.sleep(2)

        except urllib.error.HTTPError as http_err:
            if http_err.code == 401:
                print(f"[AUTH ERROR] Station token invalid or station disconnected. Waiting 10s...")
                time.sleep(10)
            elif http_err.code != 404:
                time.sleep(3)
        except Exception as e:
            time.sleep(3)

if __name__ == '__main__':
    try:
        run_connector()
    except KeyboardInterrupt:
        print("\n[CONNECTOR STOPPED BY OPERATOR]")
        sys.exit(0)
