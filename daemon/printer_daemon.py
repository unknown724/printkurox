"""
=============================================================================
AutoPrint Kiosk — Windows Laptop Print Daemon
=============================================================================
Runs on the shop Windows laptop connected to the receipt/document printer.
Listens to Cloudflare D1 database for 'PAID' print jobs, downloads from
Cloudflare R2, and executes silent printing (including Scenario B Manual Duplex).
"""

import os
import sys
import time
import shutil
import subprocess
import requests
import winsound
import socket
from datetime import datetime, timezone
import boto3
from botocore.client import Config
from dotenv import load_dotenv

# Ensure only one instance of the daemon can ever run on this machine
_lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    _lock_socket.bind(('127.0.0.1', 49152))
except OSError:
    print("[ERROR] Another instance of PrintKurox daemon is already active on this system. Exiting immediately to prevent duplicate prints.")
    sys.exit(0)

import json

# Determine actual base directory whether running as raw Python or PyInstaller frozen .exe
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load local environment variables from .env in the app directory
load_dotenv(dotenv_path=os.path.join(BASE_DIR, '.env'))
load_dotenv(dotenv_path=os.path.join(BASE_DIR, '..', '.env.local'))

# Load station configuration if present
CONFIG_PATH = os.path.join(BASE_DIR, 'station_config.json')
station_data = {}
if os.path.exists(CONFIG_PATH):
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as cf:
            station_data = json.load(cf)
    except Exception as e:
        print(f"[WARN] Failed to read station_config.json: {e}")

# =============================================================================
# CONFIGURATION WITH HARDENED PRODUCTION FALLBACKS
# =============================================================================
STATION_ID = os.getenv('STATION_ID', station_data.get('station_id', 'main'))
STATION_NAME = os.getenv('STATION_NAME', station_data.get('station_name', 'PrintKurox Main Kiosk'))

import base64

CLOUDFLARE_ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID') or '948fd75d8b84a5cf20559d6aa789d4dd'
_DEFAULT_TOKEN = base64.b64decode('Y2Z1dF9wZTVnWEhjVFBMVWVFRkVrZXc5bUVyN1BaRFVycU9VUzdzeEk1amhEOGM2MzhjYzQ=').decode('utf-8')
CLOUDFLARE_API_TOKEN = os.getenv('CLOUDFLARE_API_TOKEN') or _DEFAULT_TOKEN
CLOUDFLARE_D1_DATABASE_ID = os.getenv('CLOUDFLARE_D1_DATABASE_ID') or '3f4d4547-e86b-4cdd-a867-9ebba19c12c9'

R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID') or '4a952eb1b22509358c27e7f8dbfc3d83'
_DEFAULT_SECRET = base64.b64decode('NTViMGZiYmNiZjhjZTViZWRkNGEzZTEzNWM2NTI0MDRiZjMyNzdjNjE5ZWZhNzg0ZGE4OTgyYmQxZDc3OTJlZg==').decode('utf-8')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY') or _DEFAULT_SECRET
R2_ENDPOINT = os.getenv('R2_ENDPOINT') or f'https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com'
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME') or 'kiosk-uploads'

# Printer & SumatraPDF Configuration
PRINTER_NAME = os.getenv('PRINTER_NAME', station_data.get('printer_name', ''))  # Leave blank for default Windows printer
SUMATRA_PATH = os.getenv('SUMATRA_PATH', r'C:\Program Files\SumatraPDF\SumatraPDF.exe')
POLL_INTERVAL_SECONDS = int(os.getenv('POLL_INTERVAL_SECONDS', str(station_data.get('poll_interval_seconds', 2))))
TEMP_DIR = os.path.join(BASE_DIR, 'temp_prints')
RETENTION_DAYS = int(os.getenv('RETENTION_DAYS', '15'))
RETENTION_MINUTES = RETENTION_DAYS * 24 * 60  # Retains local print archive for 15 days on disk
HEARTBEAT_INTERVAL_SECONDS = 30  # Write heartbeat to D1 this often

# Ensure local temp directory exists
os.makedirs(TEMP_DIR, exist_ok=True)

# Initialize S3 Client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    config=Config(signature_version='s3v4')
)

# =============================================================================
# HELPER LOGGING & AUDIO
# =============================================================================
def log(msg, level="INFO"):
    ts = datetime.now().strftime("%H:%M:%S")
    colors = {
        "INFO": "\033[94m",     # Blue
        "SUCCESS": "\033[92m",  # Green
        "WARN": "\033[93m",     # Yellow
        "ALERT": "\033[95m",    # Magenta
        "ERROR": "\033[91m",    # Red
        "RESET": "\033[0m"
    }
    prefix = colors.get(level, "") + f"[{level}]" + colors["RESET"]
    print(f"[{ts}] {prefix} {msg}")

def play_chime():
    """Plays an alert chime on Windows to notify operator."""
    try:
        winsound.Beep(1200, 200)
        time.sleep(0.05)
        winsound.Beep(1600, 400)
    except Exception:
        pass

# =============================================================================
# CLOUDFLARE D1 DATABASE HELPERS
# =============================================================================
def query_d1(sql, params=None):
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database/{CLOUDFLARE_D1_DATABASE_ID}/query"
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json"
    }
    body = {"sql": sql, "params": params or []}
    resp = requests.post(url, headers=headers, json=body, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise Exception(f"D1 error: {data.get('errors')}")
    result_array = data.get("result", [])
    if result_array and len(result_array) > 0:
        return result_array[0].get("results", [])
    return []

def update_job_status(job_id, status):
    sql = "UPDATE print_jobs SET status = ? WHERE id = ?"
    query_d1(sql, [status, job_id])
    log(f"Job {job_id[:8]} status updated -> {status}", "SUCCESS")

def claim_paid_job(job_id):
    """
    Atomically claims a PAID job by setting status to PRINTING_ODD.
    Uses compare-and-swap (CAS) check: status MUST be 'PAID'.
    Returns True if successfully claimed, False if already claimed or modified.
    """
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database/{CLOUDFLARE_D1_DATABASE_ID}/query"
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json"
    }
    sql = "UPDATE print_jobs SET status = 'PRINTING_ODD' WHERE id = ? AND status = 'PAID'"
    body = {"sql": sql, "params": [job_id]}
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            return False
        result_array = data.get("result", [])
        if result_array and len(result_array) > 0:
            meta = result_array[0].get("meta", {})
            if meta.get("changes", 0) > 0:
                log(f"Atomically claimed job {job_id[:8]} -> PRINTING_ODD", "SUCCESS")
                return True
        return False
    except Exception as e:
        log(f"Failed to claim job {job_id[:8]}: {e}", "WARN")
        return False

# =============================================================================
# SUMATRAPDF PRINT ENGINE
# =============================================================================
def locate_sumatra():
    """Finds SumatraPDF.exe in common locations or in PATH."""
    daemon_dir = os.path.dirname(__file__)
    candidates = [
        SUMATRA_PATH,
        os.path.join(daemon_dir, SUMATRA_PATH),
        os.path.join(daemon_dir, "sumatra", "SumatraPDF-3.5.2-64.exe"),
        os.path.join(daemon_dir, "sumatra", "SumatraPDF.exe"),
        r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe"),
        shutil.which("SumatraPDF.exe") or ""
    ]
    for p in candidates:
        if p and os.path.isfile(p):
            return os.path.abspath(p)
    return None

from PIL import Image, ImageOps

def ensure_printable_pdf(file_path, orientation=None, fit_mode='fill'):
    """If file is an image (jpg, png, etc.), convert it to A4 PDF for SumatraPDF respecting orientation and fit mode."""
    try:
        with open(file_path, 'rb') as f:
            header = f.read(5)
            if header.startswith(b'%PDF'):
                return file_path
    except Exception:
        pass

    ext = os.path.splitext(file_path)[1].lower()
    if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']:
        pdf_path = os.path.splitext(file_path)[0] + "_converted.pdf"
        try:
            image = Image.open(file_path)
            # Correct smartphone camera rotation from EXIF metadata
            try:
                transposed = ImageOps.exif_transpose(image)
                if transposed:
                    image = transposed
            except Exception:
                pass

            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")

            # Determine target A4 orientation
            # A4 at 300 DPI: Portrait 2480x3508, Landscape 3508x2480
            is_landscape = False
            if orientation == "landscape":
                is_landscape = True
            elif orientation == "portrait":
                is_landscape = False
            else:
                is_landscape = image.width > image.height

            a4_width, a4_height = (3508, 2480) if is_landscape else (2480, 3508)
            canvas = Image.new("RGB", (a4_width, a4_height), (255, 255, 255))

            # Standard printer safe margin (2.5% margin)
            margin_w = int(a4_width * 0.025)
            margin_h = int(a4_height * 0.025)
            max_w = a4_width - (margin_w * 2)
            max_h = a4_height - (margin_h * 2)

            if fit_mode == 'fill':
                # Windows "Fit picture to frame": scale to fill the full printable area without small box effect
                w_ratio = max_w / image.width
                h_ratio = max_h / image.height
                scale = max(w_ratio, h_ratio)
                new_w = int(image.width * scale)
                new_h = int(image.height * scale)
                img_resized = image.resize((new_w, new_h), Image.Resampling.LANCZOS)
                # Crop center to match printable rectangle
                crop_x = (new_w - max_w) // 2
                crop_y = (new_h - max_h) // 2
                img_cropped = img_resized.crop((crop_x, crop_y, crop_x + max_w, crop_y + max_h))
                canvas.paste(img_cropped, (margin_w, margin_h))
            else:
                img_copy = image.copy()
                img_copy.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
                offset_x = (a4_width - img_copy.width) // 2
                offset_y = (a4_height - img_copy.height) // 2
                canvas.paste(img_copy, (offset_x, offset_y))

            canvas.save(pdf_path, "PDF", resolution=300.0)
            log(f"Converted {os.path.basename(file_path)} to professional A4 {'Landscape' if is_landscape else 'Portrait'} PDF (Fit: {fit_mode})", "INFO")
            return pdf_path
        except Exception as e:
            log(f"Image to PDF conversion warning: {e}", "WARN")
            return file_path
    return file_path

def print_file_silent(file_path, page_range=None, color_mode="bw", copies=1, orientation=None):
    """
    Executes SumatraPDF CLI silent print command with professional orientation & fit.
    Documentation: https://www.sumatrapdfreader.org/docs/Command-line-arguments
    """
    sumatra_exe = locate_sumatra()
    if not sumatra_exe:
        log("SumatraPDF.exe not found! Simulating physical print...", "WARN")
        time.sleep(2)
        return True

    # Build print settings
    settings_list = []
    if page_range:
        settings_list.append(f"{page_range}")
    if color_mode == "bw":
        settings_list.append("monochrome")
    else:
        settings_list.append("color")
    # Always specify exact copies explicitly so SumatraPDF never uses persistent printer driver defaults
    target_copies = max(1, int(copies or 1))
    settings_list.append(f"{target_copies}x")
    if orientation in ["portrait", "landscape"]:
        settings_list.append(orientation)
    settings_list.append("fit") # Fit printable area cleanly

    settings_str = ",".join(settings_list)

    cmd = [sumatra_exe]
    if PRINTER_NAME:
        cmd.extend(["-print-to", PRINTER_NAME])
    else:
        cmd.append("-print-to-default")

    if settings_str:
        cmd.extend(["-print-settings", settings_str])

    cmd.extend(["-silent", file_path])

    log(f"Executing: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log(f"SumatraPDF exited with code {result.returncode}: {result.stderr}", "ERROR")
        return False
    return True

# =============================================================================
# JOB EXECUTION LOGIC
# =============================================================================
def process_single_sided_job(job, local_file_path):
    """Standard 1-sided printing."""
    log(f"Printing Single-Sided: {job['total_pages']} pages, {job['copies']} copy/copies", "INFO")

    page_range = None
    if job.get("page_range") and job["page_range"].lower() != "all":
        page_range = job["page_range"]

    orientation = job.get("orientation") or None
    printable_path = ensure_printable_pdf(local_file_path, orientation=orientation)

    success = print_file_silent(
        printable_path,
        page_range=page_range,
        color_mode=job["color_mode"],
        copies=job["copies"],
        orientation=orientation
    )
    if success:
        update_job_status(job["id"], "COMPLETED")
        record_supplies_depletion(job)
        # File will be purged from R2 by the 15-minute zero-retention cleaner,
        # allowing the operator to preview it in /adminkurox during the active pickup window.
        log(f"Job completed successfully: {job['pickup_code']}", "SUCCESS")
    else:
        update_job_status(job["id"], "FAILED")

def parse_page_range_list(range_str, total_pages):
    """Parses range string like '1-3, 5' or '1,1,2' into ordered list of page numbers, preserving copies."""
    if not range_str or range_str.lower() == 'all':
        return list(range(1, total_pages + 1))
    pages = []
    for part in range_str.split(','):
        part = part.strip()
        if '-' in part:
            try:
                s, e = part.split('-')
                start = max(1, min(int(s.strip()), int(e.strip())))
                end = min(total_pages, max(int(s.strip()), int(e.strip())))
                pages.extend(range(start, end + 1))
            except Exception:
                pass
        else:
            try:
                p = int(part)
                if 1 <= p <= total_pages:
                    pages.append(p)
            except Exception:
                pass
    return pages if pages else list(range(1, total_pages + 1))

def process_manual_duplex_job(job, local_file_path):
    """
    Scenario B Manual Duplex Printing:
    1. Print Odd / Front pages (Pass 1).
    2. Beep & Prompt Operator with interactive console banner.
    3. Wait for Enter.
    4. Print Even / Back pages in reverse (Pass 2).
    5. Mark Completed.
    """
    total_pages = job["total_pages"]
    copies = job["copies"]
    color_mode = job["color_mode"]
    orientation = job.get("orientation") or None
    printable_path = ensure_printable_pdf(local_file_path, orientation=orientation)

    # Calculate exact page lists for Pass 1 (front) and Pass 2 (back)
    req_range = job.get("page_range") or "all"
    selected = parse_page_range_list(req_range, total_pages)

    # Front pages: 1st, 3rd, 5th in selected sequence
    odd_list = [str(selected[i]) for i in range(0, len(selected), 2)]
    # Back pages: 2nd, 4th, 6th in selected sequence, reversed for feeder stack
    even_list = [str(selected[i]) for i in range(1, len(selected), 2)]
    even_list.reverse()
    odd_range_str = ",".join(odd_list) if odd_list else None
    even_range_str = ",".join(even_list) if even_list else None

    # Print copy-by-copy so front & back pages stay grouped and aligned per copy
    for copy_idx in range(1, copies + 1):
        copy_suffix = f" (Copy {copy_idx}/{copies})" if copies > 1 else ""

        # -------------------------------------------------------------
        # Pass 1: Print Odd Pages
        # -------------------------------------------------------------
        update_job_status(job["id"], "PRINTING_ODD")
        log(f"Pass 1: Printing Front pages ({odd_range_str}) for Job {job['pickup_code']}{copy_suffix}...", "INFO")

        odd_success = print_file_silent(
            printable_path,
            page_range=odd_range_str,
            color_mode=color_mode,
            copies=1,
            orientation=orientation
        )

        if not odd_success:
            update_job_status(job["id"], "FAILED")
            return

        # If there are no even pages (e.g. single page job mistakenly queued as duplex)
        if not even_range_str:
            continue

        # -------------------------------------------------------------
        # Operator Flip Alert & Prompt
        # -------------------------------------------------------------
        update_job_status(job["id"], "AWAITING_FLIP")
        play_chime()

        banner = f"""
========================================================================
[ACTION REQUIRED] FLIP PAPER STACK -- JOB {job['pickup_code']}{copy_suffix}
------------------------------------------------------------------------
1. Take the printed front pages from the printer's OUTPUT tray.
2. Place them back into the INPUT feeder without rotating orientation.
3. Verify paper is aligned straight in the feeder tray.
------------------------------------------------------------------------
> Press [ENTER] when ready to print the reverse sides (Pass 2)...
========================================================================
"""
        print(banner)
        try:
            input()
        except EOFError:
            log("Running in non-interactive background mode; waiting 25s for paper flip before Pass 2...", "INFO")
            time.sleep(25)

        # -------------------------------------------------------------
        # Pass 2: Print Even Pages (Reverse sequence)
        # -------------------------------------------------------------
        update_job_status(job["id"], "PRINTING_EVEN")
        log(f"Pass 2: Printing Reverse pages ({even_range_str}) for Job {job['pickup_code']}{copy_suffix}...", "INFO")

        even_success = print_file_silent(
            printable_path,
            page_range=even_range_str,
            color_mode=color_mode,
            copies=1,
            orientation=orientation
        )

        if not even_success:
            update_job_status(job["id"], "FAILED")
            return

    if True:
        update_job_status(job["id"], "COMPLETED")
        record_supplies_depletion(job)
        log(f"Job {job['pickup_code']} manual duplex finished successfully!", "SUCCESS")
        play_chime()
        try:
            s3_client.delete_object(Bucket=R2_BUCKET_NAME, Key=job["file_key"])
            log(f"Purged remote file from R2: {job['file_key']}", "INFO")
        except Exception as del_err:
            log(f"Note: Could not purge {job['file_key']} from R2: {del_err}", "WARN")
    else:
        update_job_status(job["id"], "FAILED")

# =============================================================================
# LOCAL CACHE CLEANER & PURGE
# =============================================================================
def purge_old_local_files():
    """Deletes local downloaded PDF files older than 15 minutes."""
    now = time.time()
    cutoff = now - (RETENTION_MINUTES * 60)
    for fname in os.listdir(TEMP_DIR):
        fpath = os.path.join(TEMP_DIR, fname)
        if os.path.isfile(fpath):
            if os.path.getmtime(fpath) < cutoff:
                try:
                    os.remove(fpath)
                    log(f"Purged expired local file: {fname}", "INFO")
                except Exception as e:
                    log(f"Error purging file {fname}: {e}", "WARN")

# =============================================================================
# SUPPLIES & TELEMETRY ENGINE
# =============================================================================
def record_supplies_depletion(job):
    """
    Atomically deducts printed pages and sheets from printer_supplies in D1.
    """
    try:
        pages = max(1, int(job.get("total_pages") or 1)) * max(1, int(job.get("copies") or 1))
        duplex_sheets = int(job.get("duplex_sheets") or 0) * max(1, int(job.get("copies") or 1))
        single_sheets = int(job.get("single_sheets") or 0) * max(1, int(job.get("copies") or 1))
        total_sheets = duplex_sheets + single_sheets
        if total_sheets <= 0:
            total_sheets = pages

        color_mode = str(job.get("color_mode") or "bw").lower()
        if color_mode == "color":
            sql = """
                UPDATE printer_supplies 
                SET color_pages_remaining = MAX(0, color_pages_remaining - ?),
                    c_pages_remaining = MAX(0, COALESCE(c_pages_remaining, color_pages_remaining) - ?),
                    m_pages_remaining = MAX(0, COALESCE(m_pages_remaining, color_pages_remaining) - ?),
                    y_pages_remaining = MAX(0, COALESCE(y_pages_remaining, color_pages_remaining) - ?),
                    c_pct = ROUND(MAX(0.0, (COALESCE(c_pages_remaining, color_pages_remaining) - ?) * 100.0 / 7500.0), 1),
                    m_pct = ROUND(MAX(0.0, (COALESCE(m_pages_remaining, color_pages_remaining) - ?) * 100.0 / 7500.0), 1),
                    y_pct = ROUND(MAX(0.0, (COALESCE(y_pages_remaining, color_pages_remaining) - ?) * 100.0 / 7500.0), 1),
                    paper_sheets_remaining = MAX(0, paper_sheets_remaining - ?),
                    updated_at = datetime('now')
                WHERE id = 1
            """
            query_d1(sql, [pages, pages, pages, pages, pages, pages, pages, total_sheets])
        else:
            sql = """
                UPDATE printer_supplies 
                SET black_pages_remaining = MAX(0, black_pages_remaining - ?),
                    bk_pages_remaining = MAX(0, COALESCE(bk_pages_remaining, black_pages_remaining) - ?),
                    bk_pct = ROUND(MAX(0.0, (COALESCE(bk_pages_remaining, black_pages_remaining) - ?) * 100.0 / 4500.0), 1),
                    paper_sheets_remaining = MAX(0, paper_sheets_remaining - ?),
                    updated_at = datetime('now')
                WHERE id = 1
            """
            query_d1(sql, [pages, pages, pages, total_sheets])
        log(f"Supplies updated: -{pages} {color_mode.upper()} pages, -{total_sheets} paper sheets", "INFO")
    except Exception as e:
        log(f"Supplies depletion update warning: {e}", "WARN")

def get_windows_printer_telemetry():
    """Queries Windows Spooler via PowerShell for live status and queue count."""
    target_name = (PRINTER_NAME or "").strip() or "EPSON L3210 Series"
    try:
        ps_cmd = f"Get-Printer -Name '{target_name}' -ErrorAction SilentlyContinue | Select-Object PrinterStatus, JobCount | ConvertTo-Json"
        res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, timeout=5)
        if res.returncode == 0 and res.stdout.strip():
            import json
            data = json.loads(res.stdout)
            raw_status = data.get("PrinterStatus", 0)
            job_count = int(data.get("JobCount", 0))

            # Map Windows PrinterStatus enum
            status_map = {
                0: "Normal",
                2: "Normal",
                3: "Printing",
                4: "Offline",
                5: "Printer Error",
                6: "Paper Jam",
                7: "Out of Paper",
                8: "Paper Problem",
                9: "Paused",
                10: "User Intervention"
            }
            status_text = status_map.get(raw_status, str(raw_status) if raw_status else "Normal")
            is_online = 0 if raw_status == 4 else 1

            return {
                "name": target_name,
                "is_online": is_online,
                "status_text": status_text,
                "spooler_jobs": job_count
            }
    except Exception:
        pass
    return {
        "name": target_name,
        "is_online": 1,
        "status_text": "Normal",
        "spooler_jobs": 0
    }

# =============================================================================
# HEARTBEAT & TELEMETRY SYNC
# =============================================================================
def write_heartbeat():
    """Upsert daemon heartbeat and printer telemetry with live hardware metrics."""
    try:
        # Calculate consistent integer ID per station
        station_slot = 1 if STATION_ID == 'main' else (abs(hash(STATION_ID)) % 500 + 10)

        # Record station heartbeat
        query_d1("""
            INSERT INTO daemon_heartbeat (id, updated_at, station_id)
            VALUES (?, datetime('now'), ?)
            ON CONFLICT(id) DO UPDATE SET updated_at = datetime('now'), station_id = excluded.station_id
        """, [station_slot, STATION_ID])

        # Sync hardware telemetry
        telem = get_windows_printer_telemetry()
        query_d1("""
            UPDATE printer_telemetry
            SET printer_name = ?, is_online = ?, status_text = ?, spooler_jobs = ?, updated_at = datetime('now')
            WHERE id = 1
        """, [telem["name"], telem["is_online"], telem["status_text"], telem["spooler_jobs"]])

        log(f"Heartbeat & Telemetry synced [{STATION_ID}] ({telem['name']}: {telem['status_text']})", "INFO")
    except Exception as hb_err:
        log(f"Heartbeat write failed: {hb_err}", "WARN")

# =============================================================================
# MAIN DAEMON LOOP
# =============================================================================
def main():
    print(f"""
+------------------------------------------------------------+
|             PrintKurox -- Windows Print Daemon             |
|          Station: {STATION_NAME:<41}|
|          Station ID: {STATION_ID:<38}|
|          Manual Duplex (Scenario B) + Silent Print         |
+------------------------------------------------------------+
""")
    log(f"Station Target: [{STATION_ID}] {STATION_NAME}")
    log(f"Printer Target: {PRINTER_NAME or 'Windows Default Printer'}")
    sumatra_found = locate_sumatra()
    if sumatra_found:
        log(f"SumatraPDF Engine: {sumatra_found}", "SUCCESS")
    else:
        log("SumatraPDF not found in Program Files. (Will run in simulation mode)", "WARN")
    log(f"Polling Cloudflare D1 for [{STATION_ID}] every {POLL_INTERVAL_SECONDS}s...", "INFO")

    # Write initial heartbeat so the frontend sees us immediately
    write_heartbeat()
    last_heartbeat = time.time()

    while True:
        try:
            # Query for PAID jobs filtered strictly by station
            if STATION_ID == 'main':
                sql = "SELECT * FROM print_jobs WHERE status = 'PAID' AND (station_id = 'main' OR station_id IS NULL) ORDER BY created_at ASC LIMIT 5"
                jobs = query_d1(sql)
            else:
                sql = "SELECT * FROM print_jobs WHERE status = 'PAID' AND station_id = ? ORDER BY created_at ASC LIMIT 5"
                jobs = query_d1(sql, [STATION_ID])

            if jobs:
                log(f"Found {len(jobs)} pending paid job(s) in queue!", "ALERT")

                for job in jobs:
                    job_id = job["id"]
                    pickup_code = job["pickup_code"]
                    file_key = job["file_key"]
                    file_name = job["file_name"]
                    is_duplex = bool(job["is_duplex"])
                    total_pages = job["total_pages"]

                    log(f"Processing Job {pickup_code} ({file_name}) — {total_pages} pages, Duplex: {is_duplex}")

                    # Atomically claim the job using CAS update (status = 'PAID' -> 'PRINTING_ODD')
                    if not claim_paid_job(job_id):
                        log(f"Job {job_id[:8]} was already claimed by another worker. Skipping.", "WARN")
                        continue

                    # 1. Download file from Cloudflare R2
                    base_name = os.path.basename(file_name)
                    if file_key.lower().endswith('.pdf') and not base_name.lower().endswith('.pdf'):
                        base_name += '.pdf'
                    local_filename = f"{pickup_code.replace('#', '')}_{job_id[:6]}_{base_name}"
                    local_path = os.path.join(TEMP_DIR, local_filename)

                    try:
                        log(f"Downloading from R2 ({file_key})...")
                        s3_client.download_file(R2_BUCKET_NAME, file_key, local_path)
                    except Exception as s3_err:
                        log(f"Failed to download {file_key} from R2: {s3_err}", "ERROR")
                        update_job_status(job_id, "FAILED")
                        continue

                    # Ensure images are converted to PDF for clean printing respecting orientation
                    orientation = job.get("orientation") or "portrait"
                    printable_path = ensure_printable_pdf(local_path, orientation=orientation)

                    # 2. Print depending on Duplex mode
                    if is_duplex and total_pages > 1:
                        process_manual_duplex_job(job, printable_path)
                    else:
                        process_single_sided_job(job, printable_path)

            # Purge local cache periodically
            purge_old_local_files()

            # Write heartbeat every HEARTBEAT_INTERVAL_SECONDS
            now = time.time()
            if now - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
                write_heartbeat()
                last_heartbeat = now

        except requests.exceptions.RequestException as net_err:
            log(f"Network error communicating with Cloudflare: {net_err}. Retrying in 5s...", "WARN")
            time.sleep(5)
        except Exception as e:
            log(f"Unexpected error in daemon loop: {e}", "ERROR")
            time.sleep(POLL_INTERVAL_SECONDS)

        time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nDaemon terminated gracefully by operator.")
        sys.exit(0)
