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
from datetime import datetime, timezone
import boto3
from botocore.client import Config
from dotenv import load_dotenv

# Load local environment variables from daemon/.env or parent .env.local
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# =============================================================================
# CONFIGURATION
# =============================================================================
CLOUDFLARE_ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID', '948fd75d8b84a5cf20559d6aa789d4dd')
CLOUDFLARE_API_TOKEN = os.getenv('CLOUDFLARE_API_TOKEN', 'cfat_anp9h1g8fRES9Euxqup0joShGwK0K31OSDRzFtfafd3b257f')
CLOUDFLARE_D1_DATABASE_ID = os.getenv('CLOUDFLARE_D1_DATABASE_ID', '3f4d4547-e86b-4cdd-a867-9ebba19c12c9')

R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', '0f5bb8b4f2d7c00a84da3c20efcc8949')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', 'cf9c00b5509a1be636238fab2c332fff210300607e89ab802c86a829c9ddbcda')
R2_ENDPOINT = os.getenv('R2_ENDPOINT', f'https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'kiosk-uploads')

# Printer & SumatraPDF Configuration
PRINTER_NAME = os.getenv('PRINTER_NAME', '')  # Leave blank for default Windows printer
SUMATRA_PATH = os.getenv('SUMATRA_PATH', r'C:\Program Files\SumatraPDF\SumatraPDF.exe')
POLL_INTERVAL_SECONDS = int(os.getenv('POLL_INTERVAL_SECONDS', '2'))
TEMP_DIR = os.path.join(os.path.dirname(__file__), 'temp_prints')
RETENTION_MINUTES = 15

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

from PIL import Image

def ensure_printable_pdf(file_path):
    """If file is an image (jpg, png, etc.), convert it to A4 PDF for SumatraPDF."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']:
        pdf_path = os.path.splitext(file_path)[0] + "_converted.pdf"
        try:
            image = Image.open(file_path)
            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")
            image.save(pdf_path, "PDF", resolution=100.0)
            log(f"Converted {os.path.basename(file_path)} to printable PDF: {os.path.basename(pdf_path)}", "INFO")
            return pdf_path
        except Exception as e:
            log(f"Image to PDF conversion warning: {e}", "WARN")
            return file_path
    return file_path

def print_file_silent(file_path, page_range=None, color_mode="bw", copies=1):
    """
    Executes SumatraPDF CLI silent print command.
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
    if copies > 1:
        settings_list.append(f"{copies}x")

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
    update_job_status(job["id"], "PRINTING_ODD")
    log(f"Printing Single-Sided: {job['total_pages']} pages, {job['copies']} copy/copies", "INFO")

    page_range = None
    if job.get("page_range") and job["page_range"].lower() != "all":
        page_range = job["page_range"]

    success = print_file_silent(
        local_file_path,
        page_range=page_range,
        color_mode=job["color_mode"],
        copies=job["copies"]
    )
    if success:
        update_job_status(job["id"], "COMPLETED")
    else:
        update_job_status(job["id"], "FAILED")

def process_manual_duplex_job(job, local_file_path):
    """
    Scenario B Manual Duplex Printing:
    1. Print Odd pages (Pass 1).
    2. Beep & Prompt Operator with interactive console banner.
    3. Wait for Enter.
    4. Print Even pages (Pass 2).
    5. Mark Completed.
    """
    total_pages = job["total_pages"]
    copies = job["copies"]
    color_mode = job["color_mode"]

    # -------------------------------------------------------------
    # Pass 1: Print Odd Pages
    # -------------------------------------------------------------
    update_job_status(job["id"], "PRINTING_ODD")
    log(f"Pass 1: Printing ODD pages for Job {job['pickup_code']}...", "INFO")

    # SumatraPDF allows odd/even in print-settings
    odd_success = print_file_silent(
        local_file_path,
        page_range="odd",
        color_mode=color_mode,
        copies=copies
    )

    if not odd_success:
        update_job_status(job["id"], "FAILED")
        return

    # -------------------------------------------------------------
    # Operator Flip Alert & Prompt
    # -------------------------------------------------------------
    update_job_status(job["id"], "AWAITING_FLIP")
    play_chime()

    banner = f"""
========================================================================
[ACTION REQUIRED] FLIP PAPER STACK -- JOB {job['pickup_code']} ({job['copies']} copy/copies)
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
        time.sleep(5)

    # -------------------------------------------------------------
    # Pass 2: Print Even Pages (Reverse sequence)
    # -------------------------------------------------------------
    update_job_status(job["id"], "PRINTING_EVEN")
    log(f"Pass 2: Printing EVEN reverse pages for Job {job['pickup_code']}...", "INFO")

    even_success = print_file_silent(
        local_file_path,
        page_range="even,reverse",
        color_mode=color_mode,
        copies=copies
    )

    if even_success:
        update_job_status(job["id"], "COMPLETED")
        log(f"Job {job['pickup_code']} manual duplex finished successfully!", "SUCCESS")
        play_chime()
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
# MAIN DAEMON LOOP
# =============================================================================
def main():
    print("""
+------------------------------------------------------------+
|             PrintKurox -- Windows Print Daemon             |
|          Manual Duplex (Scenario B) + Silent Print         |
+------------------------------------------------------------+
""")
    log(f"Printer Target: {PRINTER_NAME or 'Windows Default Printer'}")
    sumatra_found = locate_sumatra()
    if sumatra_found:
        log(f"SumatraPDF Engine: {sumatra_found}", "SUCCESS")
    else:
        log("SumatraPDF not found in Program Files. (Will run in simulation mode)", "WARN")
    log(f"Polling Cloudflare D1 every {POLL_INTERVAL_SECONDS}s...", "INFO")

    while True:
        try:
            # Query for PAID jobs
            sql = "SELECT * FROM print_jobs WHERE status = 'PAID' ORDER BY created_at ASC LIMIT 5"
            jobs = query_d1(sql)

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

                    # 1. Download file from Cloudflare R2
                    local_filename = f"{pickup_code.replace('#', '')}_{job_id[:6]}_{os.path.basename(file_name)}"
                    local_path = os.path.join(TEMP_DIR, local_filename)

                    try:
                        log(f"Downloading from R2 ({file_key})...")
                        s3_client.download_file(R2_BUCKET_NAME, file_key, local_path)
                    except Exception as s3_err:
                        log(f"Failed to download {file_key} from R2: {s3_err}", "ERROR")
                        update_job_status(job_id, "FAILED")
                        continue

                    # Ensure images are converted to PDF for clean printing
                    printable_path = ensure_printable_pdf(local_path)

                    # 2. Print depending on Duplex mode
                    if is_duplex and total_pages > 1:
                        process_manual_duplex_job(job, printable_path)
                    else:
                        process_single_sided_job(job, printable_path)

            # Purge local cache periodically
            purge_old_local_files()

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
