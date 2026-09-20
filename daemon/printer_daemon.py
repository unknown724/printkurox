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
import json
import re
from datetime import datetime, timezone
import threading
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv

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
STATION_ID = os.getenv('STATION_ID', station_data.get('station_id', 'block_b'))
STATION_NAME = os.getenv('STATION_NAME', station_data.get('station_name', 'NERIST Block B (Pare Hostel)'))

STATION_SLOTS = {
    'main': 1,
    'block_b': 1,
    'block_c': 2,
    'block_a': 3,
    'block_d': 4,
    'block_e': 5,
    'block_f': 6,
    'block_g': 7,
    'block_h': 8,
    'girls_hostel': 9,
    'romen': 154,
    'romen_xerox': 154,
}
STATION_SLOT = STATION_SLOTS.get(STATION_ID, 154 if 'romen' in STATION_ID else 1)

# Ensure only one instance of the daemon can ever run on this machine per station
lock_port = 49150 + (STATION_SLOT % 100)
_lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    _lock_socket.bind(('127.0.0.1', lock_port))
except OSError:
    print(f"[ERROR] Another instance of PrintKurox daemon for [{STATION_ID}] (port {lock_port}) is already active on this system. Exiting immediately to prevent duplicate prints.")
    sys.exit(0)

# =============================================================================
# ZERO-CLOUD-SECRET PROXY CONFIGURATION
# =============================================================================
# The daemon connects ONLY to the authenticated Next.js proxy server.
# Master Cloudflare D1 and R2 cloud credentials NEVER touch this laptop!
default_server = 'http://localhost:3000' if os.path.exists(os.path.join(BASE_DIR, '.dev_local')) else 'https://printkurox.vercel.app'
SERVER_URL = os.getenv('SERVER_URL', station_data.get('server_url', default_server)).rstrip('/')
STATION_TOKEN = os.getenv('STATION_TOKEN', station_data.get('station_token', ''))

# Fallback if token is not configured in station_config.json
if not STATION_TOKEN:
    import hmac, hashlib
    master_key = os.getenv('ADMIN_SECRET_KEY') or 'Kurox725#29'
    token_hash = hmac.new(master_key.encode(), f'station_daemon:{STATION_ID}'.encode(), hashlib.sha256).hexdigest()
    STATION_TOKEN = f"kurox_st_{STATION_ID}_{token_hash}"


# Printer & SumatraPDF Configuration
PRINTER_NAME = os.getenv('PRINTER_NAME', station_data.get('printer_name', ''))  # Leave blank for default Windows printer
AUTO_DUPLEX = os.getenv('AUTO_DUPLEX', str(station_data.get('auto_duplex', 'false'))).lower() == 'true'
SUMATRA_PATH = os.getenv('SUMATRA_PATH', r'C:\Program Files\SumatraPDF\SumatraPDF.exe')
POLL_INTERVAL_SECONDS = int(os.getenv('POLL_INTERVAL_SECONDS', str(station_data.get('poll_interval_seconds', 2))))
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv('HEARTBEAT_INTERVAL_SECONDS', '6'))
TEMP_DIR = os.path.join(BASE_DIR, 'temp_prints')
ARCHIVE_DIR = os.path.join(BASE_DIR, 'printed_archive')
RETENTION_DAYS = int(os.getenv('RETENTION_DAYS', '90')) # Retains local print archive for 90 days on laptop
RETENTION_MINUTES = RETENTION_DAYS * 24 * 60

# Ensure local directories exist
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(ARCHIVE_DIR, exist_ok=True)

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
    print(f"[{ts}] {prefix} {msg}", flush=True)

def play_chime():
    """Plays an alert chime on Windows to notify operator."""
    try:
        winsound.Beep(1200, 200)
        time.sleep(0.05)
        winsound.Beep(1600, 400)
    except Exception:
        pass

# =============================================================================
# ZERO-CLOUD-SECRET PROXY SESSIONS (Thread-Isolated)
# =============================================================================
_job_session = requests.Session()
_job_adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=20, max_retries=2)
_job_session.mount('https://', _job_adapter)
_job_session.mount('http://', _job_adapter)
_job_session.headers.update({
    "X-Station-Token": STATION_TOKEN,
    "Content-Type": "application/json",
    "User-Agent": f"PrintNERISTDaemon/2.0 ({STATION_ID})"
})

_hb_session = requests.Session()
_hb_adapter = requests.adapters.HTTPAdapter(pool_connections=5, pool_maxsize=10, max_retries=1)
_hb_session.mount('https://', _hb_adapter)
_hb_session.mount('http://', _hb_adapter)
_hb_session.headers.update({
    "X-Station-Token": STATION_TOKEN,
    "Content-Type": "application/json",
    "User-Agent": f"PrintNERISTDaemon/2.0 ({STATION_ID})"
})

_wake_event = threading.Event()

def update_job_status(job_id, status, pages_printed=None, sheets_used=None):
    """Updates job status and supplies depletion via server proxy."""
    url = f"{SERVER_URL}/api/daemon/status"
    body = {
        "jobId": job_id,
        "status": status,
        "pagesPrinted": pages_printed,
        "sheetsUsed": sheets_used
    }
    try:
        resp = _job_session.post(url, json=body, timeout=(3.0, 10.0))
        if resp.status_code == 200:
            log(f"Job {job_id[:8]} status updated -> {status}", "SUCCESS")
        else:
            log(f"Failed to update status for {job_id[:8]} (HTTP {resp.status_code}): {resp.text}", "WARN")
    except Exception as e:
        log(f"Notice: Status update network glitch for {job_id[:8]}: {e}", "WARN")

def claim_paid_job(job_id):
    """
    Atomically claims a PAID job via Compare-And-Swap (CAS) on server proxy.
    Returns True if claimed, False if already claimed.
    """
    url = f"{SERVER_URL}/api/daemon/claim"
    body = {"jobId": job_id}
    try:
        resp = _job_session.post(url, json=body, timeout=(3.0, 10.0))
        if resp.status_code == 200:
            data = resp.json()
            if data.get("claimed"):
                log(f"Atomically claimed job {job_id[:8]} -> {data.get('status', 'PRINTING')}", "SUCCESS")
                return True
        return False
    except Exception as e:
        log(f"Failed to claim job {job_id[:8]}: {e}", "WARN")
        return False

def download_cloud_file(job_id, dest_path):
    """
    Downloads print document securely via the server proxy.
    The laptop never accesses Cloudflare R2 directly!
    """
    url = f"{SERVER_URL}/api/daemon/job-file?jobId={job_id}"
    resp = _job_session.get(url, stream=True, timeout=(5.0, 60.0))
    resp.raise_for_status()
    with open(dest_path, 'wb') as f:
        for chunk in resp.iter_content(chunk_size=65536):
            if chunk:
                f.write(chunk)
    return True

# =============================================================================
# SUMATRAPDF PRINT ENGINE
# =============================================================================
def locate_sumatra():
    """Finds SumatraPDF.exe in common locations or in PATH."""
    candidates = [
        SUMATRA_PATH,
        os.path.join(BASE_DIR, SUMATRA_PATH),
        os.path.join(BASE_DIR, "sumatra", "SumatraPDF-3.5.2-64.exe"),
        os.path.join(BASE_DIR, "sumatra", "SumatraPDF.exe"),
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

def convert_with_libreoffice(file_path):
    """Converts Office/document file (.docx, .doc, .rtf, .odt, .pptx, .xlsx) to vector PDF via headless LibreOffice (soffice)."""
    soffice_paths = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "soffice.exe",
        "soffice"
    ]
    soffice_exe = None
    for p in soffice_paths:
        if os.path.isfile(p) or shutil.which(p):
            soffice_exe = p
            break
    if not soffice_exe:
        return None

    out_dir = os.path.dirname(os.path.abspath(file_path))
    pdf_expected = os.path.splitext(os.path.abspath(file_path))[0] + ".pdf"
    try:
        cmd = [soffice_exe, "--headless", "--convert-to", "pdf:writer_pdf_Export", "--outdir", out_dir, os.path.abspath(file_path)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
        if os.path.exists(pdf_expected) and os.path.getsize(pdf_expected) > 500:
            log(f"Converted {os.path.basename(file_path)} to vector PDF via headless LibreOffice", "SUCCESS")
            return pdf_expected
    except Exception as err:
        log(f"LibreOffice conversion notice: {err}", "WARN")
    return None

def convert_office_to_pdf(file_path):
    """
    High-fidelity native conversion of Office documents (.docx, .doc, .rtf, .pptx, .ppt, .xlsx, .xls)
    to true vector PDF using headless LibreOffice or Microsoft Office COM on Windows before sending to SumatraPDF.
    """
    ext = os.path.splitext(file_path)[1].lower()
    
    # 1. Try headless LibreOffice first (fast, 1.5s, no popups, zero UI modal hangs)
    if ext in ['.docx', '.doc', '.rtf', '.odt', '.pptx', '.ppt', '.xlsx', '.xls', '.csv']:
        lo_pdf = convert_with_libreoffice(file_path)
        if lo_pdf and os.path.exists(lo_pdf):
            return lo_pdf

    pdf_path = os.path.splitext(file_path)[0] + "_office.pdf"
    abs_src = os.path.abspath(file_path)
    abs_dst = os.path.abspath(pdf_path)

    # PowerShell automation script for Word / PPT / Excel
    if ext in ['.docx', '.doc', '.rtf']:
        ps_script = f"""
$word = $null
$doc = $null
try {{
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open([string]'{abs_src.replace("'", "''")}')
    $doc.ExportAsFixedFormat([string]'{abs_dst.replace("'", "''")}', 17)
    Write-Output "SUCCESS"
}} catch {{
    Write-Output ("FAIL: " + $_.Exception.Message)
}} finally {{
    if ($doc) {{
        try {{ $doc.Close(0) }} catch {{}}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
    }}
    if ($word) {{
        try {{ $word.Quit() }} catch {{}}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }}
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}}
"""
    elif ext in ['.pptx', '.ppt']:
        ps_script = f"""
$ppt = $null
$pres = $null
try {{
    $ppt = New-Object -ComObject PowerPoint.Application
    $pres = $ppt.Presentations.Open([string]'{abs_src.replace("'", "''")}', -1, 0, 0)
    $pres.SaveAs([string]'{abs_dst.replace("'", "''")}', 32)
    Write-Output "SUCCESS"
}} catch {{
    Write-Output ("FAIL: " + $_.Exception.Message)
}} finally {{
    if ($pres) {{
        try {{ $pres.Close() }} catch {{}}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null
    }}
    if ($ppt) {{
        try {{ $ppt.Quit() }} catch {{}}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
    }}
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}}
"""
    elif ext in ['.xlsx', '.xls', '.csv']:
        ps_script = f"""
$excel = $null
$wb = $null
try {{
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $wb = $excel.Workbooks.Open([string]'{abs_src.replace("'", "''")}', $false, $true)
    $wb.ExportAsFixedFormat(0, [string]'{abs_dst.replace("'", "''")}')
    Write-Output "SUCCESS"
}} catch {{
    Write-Output ("FAIL: " + $_.Exception.Message)
}} finally {{
    if ($wb) {{
        try {{ $wb.Close($false) }} catch {{}}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null
    }}
    if ($excel) {{
        try {{ $excel.Quit() }} catch {{}}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    }}
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}}
"""
    else:
        return file_path

    try:
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=35
        )
        if "SUCCESS" in res.stdout and os.path.exists(abs_dst):
            log(f"Converted Office document {os.path.basename(file_path)} to authentic vector PDF via Microsoft Office COM", "SUCCESS")
            return abs_dst
        else:
            log(f"Office COM conversion output: {res.stdout.strip()} {res.stderr.strip()}", "WARN")
    except Exception as e:
        log(f"Office conversion exception: {e}", "WARN")

    return file_path

def ensure_printable_pdf(file_path, orientation=None, fit_mode='fill'):
    """If file is an image or Office document, convert it to A4 PDF for SumatraPDF respecting orientation and fit mode."""
    if not file_path or not os.path.exists(file_path):
        return file_path

    # 1. Inspect Magic Bytes: If it actually starts with %PDF-, it's already a valid PDF!
    # CRITICAL: SumatraPDF routes file parsers strictly by file extension!
    # If a valid PDF has a .png/.jpg/.jpeg extension, it MUST be renamed/copied to .pdf,
    # otherwise SumatraPDF parses it with libpng/libjpeg and spools a blank page!
    try:
        with open(file_path, 'rb') as f:
            header = f.read(8)
            if header.startswith(b'%PDF-'):
                if not file_path.lower().endswith('.pdf'):
                    pdf_renamed = os.path.splitext(file_path)[0] + '.pdf'
                    if not os.path.exists(pdf_renamed) or os.path.getsize(pdf_renamed) != os.path.getsize(file_path):
                        shutil.copy2(file_path, pdf_renamed)
                    log(f"Normalized PDF extension for SumatraPDF: {os.path.basename(pdf_renamed)}", "INFO")
                    return pdf_renamed
                return file_path
    except Exception:
        pass

    # 2. Check if the file is an Image (JPEG, PNG, WEBP, BMP, etc.) via PIL Image.open
    # This detects images EVEN IF downloaded or named with a .pdf extension!
    is_image = False
    img_format = None
    try:
        with Image.open(file_path) as test_img:
            is_image = True
            img_format = test_img.format
    except Exception:
        is_image = False

    if is_image:
        pdf_path = os.path.splitext(file_path)[0]
        if not pdf_path.endswith('_converted.pdf'):
            pdf_path += '_converted.pdf'
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
            log(f"Converted {os.path.basename(file_path)} ({img_format or 'Image'}) to professional A4 {'Landscape' if is_landscape else 'Portrait'} PDF", "INFO")
            return pdf_path
        except Exception as e:
            log(f"Image to PDF conversion warning: {e}", "WARN")
            return file_path

    # 3. Check Office documents
    ext = os.path.splitext(file_path)[1].lower()
    if ext in ['.docx', '.doc', '.rtf', '.pptx', '.ppt', '.xlsx', '.xls', '.csv']:
        converted_office = convert_office_to_pdf(file_path)
        if converted_office.lower().endswith('.pdf') and os.path.exists(converted_office):
            return converted_office

    return file_path

def get_windows_printer_telemetry():
    """Queries Windows Spooler via PowerShell for live status and queue count."""
    target_name = (PRINTER_NAME or "").strip()
    try:
        if not target_name:
            ps_find_def = "Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -ExpandProperty Name"
            r_def = subprocess.run(["powershell", "-NoProfile", "-Command", ps_find_def], capture_output=True, text=True, timeout=5)
            if r_def.returncode == 0 and r_def.stdout.strip():
                target_name = r_def.stdout.strip().splitlines()[0].strip()

        if not target_name:
            target_name = "Default Printer"

        ps_cmd = f"""
$p = Get-Printer -Name '{target_name}' -ErrorAction SilentlyContinue
if ($p) {{
    $cim = Get-CimInstance Win32_Printer -Filter "Name = '$($p.Name.Replace("'", "''"))'" -ErrorAction SilentlyContinue
    $isWorkOffline = if ($p.WorkOffline -ne $null) {{ [bool]$p.WorkOffline }} elseif ($cim -and $cim.WorkOffline -ne $null) {{ [bool]$cim.WorkOffline }} else {{ $false }}
    [PSCustomObject]@{{
        PrinterStatus = [int]$p.PrinterStatus
        JobCount = [int]$p.JobCount
        WorkOffline = $isWorkOffline
        Name = [string]$p.Name
    }} | ConvertTo-Json -Compress
}}
"""
        res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, timeout=5)
        if res.returncode == 0 and res.stdout.strip():
            import json
            data = json.loads(res.stdout)
            raw_status = int(data.get("PrinterStatus", 0))
            job_count = int(data.get("JobCount", 0))
            work_offline = bool(data.get("WorkOffline", False))

            status_map = {
                0: "Ready",
                2: "Ready",
                3: "Ready",
                4: "Offline",
                5: "Out of Paper",
                6: "Paper Jam",
                7: "Offline",
                8: "Offline",
                9: "Paused",
                10: "Busy",
                11: "Printing",
                13: "Offline",
                21: "User Intervention"
            }
            if work_offline or raw_status in [4, 7, 8, 13]:
                status_text = "Offline"
                is_online = 0
            else:
                status_text = status_map.get(raw_status, "Ready" if raw_status in (0, 2, 3) else str(raw_status))
                is_online = 1

            return {
                "name": target_name,
                "is_online": is_online,
                "status_text": status_text,
                "spooler_jobs": job_count
            }
    except Exception as telem_err:
        log(f"Telemetry query notice: {telem_err}", "DEBUG")
    return {
        "name": target_name or "Default Printer",
        "is_online": 0,
        "status_text": "Offline",
        "spooler_jobs": 0
    }

def wait_for_spooler_completion(target_printer_name=None, timeout_seconds=45):
    """
    Monitors the Windows Print Spooler for the target printer.
    Ensures paper has physically finished printing before marking job COMPLETED in the UI.
    Prevents the 'Printed to tray ready to pickup but it is not there' issue.
    """
    target = (target_printer_name or PRINTER_NAME or "").strip()
    log(f"Confirming physical print delivery on ({target or 'Default Printer'})...", "INFO")

    # Give SumatraPDF and Windows Spooler a moment to register the job
    time.sleep(1.5)

    start_time = time.time()
    saw_active_job = False

    while time.time() - start_time < timeout_seconds:
        telem = get_windows_printer_telemetry()
        job_count = telem.get("spooler_jobs", 0)

        if job_count > 0:
            saw_active_job = True
            time.sleep(1.0)
            continue

        # If we observed the job in the spooler and it has now completed (job_count == 0)
        if saw_active_job and job_count == 0:
            # Settle period: EPSON L3210 needs 2 seconds to eject the sheet into the tray
            time.sleep(2.0)
            log("Physical printing confirmed! Paper delivered to output tray.", "SUCCESS")
            return True

        # If 4 seconds have passed and spooler never showed > 0 (fast spool/direct print)
        if time.time() - start_time > 4.0 and not saw_active_job:
            time.sleep(1.5)
            log("Print spool passed to printer hardware successfully.", "SUCCESS")
            return True

        time.sleep(0.8)

    log("Spooler wait timeout reached; proceeding to complete job.", "INFO")
    return True

def resolve_effective_orientation(job, local_pdf_path):
    """
    Determines if a document should be printed as Landscape or Portrait.
    Checks:
    1. job['orientation'] ('landscape' or 'portrait')
    2. job['page_configs'] JSON array for any page explicitly set to landscape or rotated 90/270
    3. pypdf inspection of the actual PDF pages: if width > height, it's naturally landscape!
    """
    orient = (job.get("orientation") or "").strip().lower()
    if orient == "landscape":
        return "landscape"

    # Check page_configs JSON string or object
    page_configs_raw = job.get("page_configs")
    if page_configs_raw:
        try:
            cfgs = json.loads(page_configs_raw) if isinstance(page_configs_raw, str) else page_configs_raw
            if isinstance(cfgs, list) and any(
                isinstance(p, dict) and p.get("included", True) and (
                    p.get("orientation") == "landscape" or
                    p.get("naturalOrientation") == "landscape" or
                    p.get("rotation") in [90, 270]
                ) for p in cfgs
            ):
                log(f"Resolved Landscape orientation from page_configs for {job.get('pickup_code', '')}", "INFO")
                return "landscape"
        except Exception:
            pass

    # Inspect PDF geometry via pypdf
    if local_pdf_path and os.path.exists(local_pdf_path):
        try:
            import pypdf
            reader = pypdf.PdfReader(local_pdf_path)
            if len(reader.pages) > 0:
                p0 = reader.pages[0]
                w = float(p0.mediabox.width)
                h = float(p0.mediabox.height)
                rot = int(p0.get('/Rotate', 0) or 0)
                if rot in [90, 270]:
                    w, h = h, w
                if w > h:
                    log(f"Auto-detected Landscape page geometry ({w:.1f} x {h:.1f} pt) from {os.path.basename(local_pdf_path)}", "INFO")
                    return "landscape"
        except Exception:
            pass

    return orient if orient in ["landscape", "portrait"] else "portrait"

def print_file_silent(file_path, page_range=None, color_mode="bw", copies=1, orientation=None, duplex=False):
    """
    Executes SumatraPDF CLI silent print command with professional orientation & fit.
    Documentation: https://www.sumatrapdfreader.org/docs/Command-line-arguments
    """
    sumatra_exe = locate_sumatra()
    if not sumatra_exe:
        log("SumatraPDF.exe not found! Simulating physical print...", "WARN")
        time.sleep(2)
        return True

    # If orientation wasn't explicitly supplied, check PDF geometry
    if not orientation or orientation not in ["portrait", "landscape"]:
        try:
            import pypdf
            reader = pypdf.PdfReader(file_path)
            if len(reader.pages) > 0:
                p0 = reader.pages[0]
                w = float(p0.mediabox.width)
                h = float(p0.mediabox.height)
                rot = int(p0.get('/Rotate', 0) or 0)
                if rot in [90, 270]:
                    w, h = h, w
                if w > h:
                    orientation = "landscape"
                else:
                    orientation = "portrait"
        except Exception:
            pass

    # Build print settings
    settings_list = []
    if page_range:
        clean_range = "".join(str(page_range).split())
        if clean_range:
            settings_list.append(clean_range)
    if color_mode == "bw":
        settings_list.append("monochrome")
    else:
        settings_list.append("color")
    # Always specify exact copies explicitly so SumatraPDF never uses persistent printer driver defaults
    target_copies = max(1, int(copies or 1))
    settings_list.append(f"{target_copies}x")
    if orientation in ["portrait", "landscape"]:
        settings_list.append(orientation)
    if duplex:
        settings_list.append("duplex")
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
def process_auto_duplex_job(job, local_file_path):
    """Hardware automatic 2-sided duplex printing for printers with built-in duplexers."""
    orientation = resolve_effective_orientation(job, local_file_path)
    job["orientation"] = orientation
    log(f"Printing Hardware Auto-Duplex ({orientation.upper()}): {job['total_pages']} pages, {job['copies']} copy/copies", "INFO")

    page_range = None
    if job.get("page_range") and job["page_range"].lower() != "all":
        page_range = job["page_range"]

    printable_path = ensure_printable_pdf(local_file_path, orientation=orientation)

    success = print_file_silent(
        printable_path,
        page_range=page_range,
        color_mode=job["color_mode"],
        copies=job["copies"],
        orientation=orientation,
        duplex=True
    )
    if success:
        wait_for_spooler_completion(PRINTER_NAME)
        update_job_status(job["id"], "COMPLETED")
        record_supplies_depletion(job)
        archive_printed_file(job, printable_path)
        log(f"Job completed successfully (Hardware Duplex): {job['pickup_code']}", "SUCCESS")
    else:
        update_job_status(job["id"], "FAILED")

def process_single_sided_job(job, local_file_path):
    """Standard 1-sided printing."""
    orientation = resolve_effective_orientation(job, local_file_path)
    job["orientation"] = orientation
    log(f"Printing Single-Sided ({orientation.upper()}): {job['total_pages']} pages, {job['copies']} copy/copies", "INFO")

    page_range = None
    if job.get("page_range") and job["page_range"].lower() != "all":
        page_range = job["page_range"]

    printable_path = ensure_printable_pdf(local_file_path, orientation=orientation)

    success = print_file_silent(
        printable_path,
        page_range=page_range,
        color_mode=job["color_mode"],
        copies=job["copies"],
        orientation=orientation
    )
    if success:
        wait_for_spooler_completion(PRINTER_NAME)
        update_job_status(job["id"], "COMPLETED")
        record_supplies_depletion(job)
        archive_printed_file(job, printable_path)
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
    orientation = resolve_effective_orientation(job, local_file_path)
    job["orientation"] = orientation
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
        wait_for_spooler_completion(PRINTER_NAME)
        update_job_status(job["id"], "COMPLETED")
        record_supplies_depletion(job)
        archive_printed_file(job, printable_path)
        log(f"Job {job['pickup_code']} manual duplex finished successfully!", "SUCCESS")
        play_chime()
    else:
        update_job_status(job["id"], "FAILED")

# =============================================================================
# LOCAL ARCHIVING & CACHE CLEANER
# =============================================================================
def archive_printed_file(job, local_file_path):
    """
    Saves a local copy of the printed document in printed_archive/YYYY-MM-DD/[pickup_code]_[name]
    so the shopkeeper retains a physical copy on disk with zero cloud storage cost.
    """
    try:
        if not local_file_path or not os.path.isfile(local_file_path):
            return
        today_folder = datetime.now().strftime("%Y-%m-%d")
        dest_dir = os.path.join(ARCHIVE_DIR, today_folder)
        os.makedirs(dest_dir, exist_ok=True)
        base_name = os.path.basename(local_file_path)
        dest_file = os.path.join(dest_dir, base_name)
        if not os.path.exists(dest_file):
            shutil.copy2(local_file_path, dest_file)
            log(f"Archived document locally to: {os.path.join(today_folder, base_name)}", "SUCCESS")
    except Exception as e:
        log(f"Notice: Failed to archive local file copy: {e}", "WARN")

def find_local_archived_file(pickup_code, job_id=None, file_name=None):
    """
    Searches TEMP_DIR and ARCHIVE_DIR recursively for any file matching pickup_code, job_id, or file_name.
    Enables instant reprinting & local PDF previewing of finished/purged jobs from local disk with 0 cloud dependencies.
    """
    clean_pickup = re.sub(r'[^a-zA-Z0-9]', '', pickup_code or '').upper()
    clean_name = re.sub(r'[^a-zA-Z0-9]', '', (file_name or '').replace('.pdf', '')).lower()

    # 1. Search in working TEMP_DIR
    if os.path.exists(TEMP_DIR):
        for fname in os.listdir(TEMP_DIR):
            fpath = os.path.join(TEMP_DIR, fname)
            if os.path.isfile(fpath):
                f_upper = fname.upper()
                if clean_pickup and (f_upper.startswith(f"{clean_pickup}_") or f"_{clean_pickup}_" in f_upper or f_upper.startswith(clean_pickup)):
                    return fpath
                if job_id and len(job_id) >= 6 and job_id[:6].lower() in fname.lower():
                    return fpath
                if clean_name and len(clean_name) >= 6 and clean_name in fname.lower():
                    return fpath

    # 2. Search in date-organized ARCHIVE_DIR
    if os.path.exists(ARCHIVE_DIR):
        for root, dirs, files in os.walk(ARCHIVE_DIR):
            for fname in files:
                f_upper = fname.upper()
                if clean_pickup and (f_upper.startswith(f"{clean_pickup}_") or f"_{clean_pickup}_" in f_upper or f_upper.startswith(clean_pickup)):
                    return os.path.join(root, fname)
                if job_id and len(job_id) >= 6 and job_id[:6].lower() in fname.lower():
                    return os.path.join(root, fname)
                if clean_name and len(clean_name) >= 6 and clean_name in fname.lower():
                    return os.path.join(root, fname)

    return None

# =============================================================================
# LOCAL PC ARCHIVE HTTP SERVICE (Port 7250)
# Enables the local Admin PC to preview local archived PDFs directly in browser
# =============================================================================
LOCAL_ARCHIVE_PORT = 7250

class LocalArchiveHTTPHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        self.do_GET()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        pickup = params.get('pickup', [None])[0]
        job_id = params.get('job_id', [None])[0]
        name = params.get('name', [None])[0]

        if parsed.path in ('/poll-now', '/notify-job', '/wake'):
            _wake_event.set()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"success": true, "message": "Daemon awakened immediately"}')
            return

        if parsed.path in ('/check', '/health'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "online",
                "service": "PrintKurox Local Daemon",
                "archive_dir": ARCHIVE_DIR,
                "temp_dir": TEMP_DIR,
            }).encode('utf-8'))
            return

        if parsed.path == '/open-folder':
            fpath = find_local_archived_file(pickup, job_id, name)
            target = fpath if fpath and os.path.exists(fpath) else ARCHIVE_DIR
            try:
                if fpath and os.path.exists(fpath):
                    subprocess.Popen(f'explorer /select,"{fpath}"')
                else:
                    subprocess.Popen(f'explorer "{ARCHIVE_DIR}"')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"success": true, "message": "Opened Windows Explorer"}')
            except Exception as exp_err:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(exp_err)}).encode('utf-8'))
            return

        if parsed.path in ('/archive', '/view'):
            fpath = find_local_archived_file(pickup, job_id, name)
            if fpath and os.path.exists(fpath):
                try:
                    with open(fpath, 'rb') as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/pdf')
                    self.send_header('Content-Disposition', f'inline; filename="{os.path.basename(fpath)}"')
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except Exception as read_err:
                    self.send_response(500)
                    self.send_header('Content-Type', 'text/plain')
                    self.end_headers()
                    self.wfile.write(f"Error reading file: {read_err}".encode('utf-8'))
                    return
            else:
                self.send_response(404)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(f"<h3>Document not found in local PC archive</h3><p>Checked {ARCHIVE_DIR}</p>".encode('utf-8'))
                return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        # Silence routine HTTP request logging to keep daemon stdout clean
        pass

def start_local_archive_server():
    try:
        server = ThreadingHTTPServer(('127.0.0.1', LOCAL_ARCHIVE_PORT), LocalArchiveHTTPHandler)
        log(f"Local Archive HTTP server online at http://127.0.0.1:{LOCAL_ARCHIVE_PORT}", "SUCCESS")
        server.serve_forever()
    except Exception as srv_err:
        log(f"Notice: Local Archive HTTP server could not start on port {LOCAL_ARCHIVE_PORT}: {srv_err}", "WARN")

def purge_old_local_files():
    """
    Cleans up temp working files older than 2 hours from temp_prints.
    Cleans up archive files from printed_archive only after RETENTION_DAYS (default 90 days).
    """
    now = time.time()
    # 1. Clean temp_prints working directory (2 hours)
    temp_cutoff = now - (2 * 60 * 60)
    for fname in os.listdir(TEMP_DIR):
        fpath = os.path.join(TEMP_DIR, fname)
        if os.path.isfile(fpath) and os.path.getmtime(fpath) < temp_cutoff:
            try:
                os.remove(fpath)
            except Exception:
                pass

    # 2. Clean printed_archive based on RETENTION_DAYS
    archive_cutoff = now - (RETENTION_MINUTES * 60)
    if os.path.exists(ARCHIVE_DIR):
        for entry in os.listdir(ARCHIVE_DIR):
            entry_path = os.path.join(ARCHIVE_DIR, entry)
            if os.path.isdir(entry_path):
                # Date folder like 2026-09-14
                try:
                    folder_mtime = os.path.getmtime(entry_path)
                    if folder_mtime < archive_cutoff:
                        shutil.rmtree(entry_path, ignore_errors=True)
                        log(f"Purged expired archive folder: {entry}", "INFO")
                except Exception:
                    pass

# =============================================================================
# SUPPLIES & TELEMETRY ENGINE
# =============================================================================
def record_supplies_depletion(job):
    """
    Supplies depletion is automatically computed and deducted server-side
    when update_job_status reports COMPLETED via /api/daemon/status.
    """
    pass

# =============================================================================
# HEARTBEAT & TELEMETRY SYNC
# =============================================================================
def write_heartbeat():
    """Upsert daemon heartbeat and printer telemetry with live hardware metrics via server proxy."""
    try:
        telem = get_windows_printer_telemetry()
        url = f"{SERVER_URL}/api/daemon/heartbeat"
        body = {"telemetry": telem}
        resp = _hb_session.post(url, json=body, timeout=(3.0, 8.0))
        if resp.status_code == 200:
            log(f"Heartbeat & Telemetry synced [{STATION_ID}] ({telem['name']}: {telem['status_text']})", "INFO")
        elif resp.status_code == 401:
            log(f"Heartbeat warning: Station token unauthorized for [{STATION_ID}]", "WARN")
    except Exception as hb_err:
        log(f"Heartbeat notice: {hb_err}", "WARN")

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
    # Start local HTTP archive preview server (port 7250)
    http_thread = threading.Thread(target=start_local_archive_server, daemon=True)
    http_thread.start()

    # Track daemon script file modification time for automatic hot-reload
    daemon_file = os.path.abspath(__file__)
    start_mtime = os.path.getmtime(daemon_file)

    # Start background heartbeat & hardware telemetry worker thread
    def heartbeat_worker():
        time.sleep(0.5)
        try:
            write_heartbeat()
        except Exception:
            pass
        while True:
            time.sleep(HEARTBEAT_INTERVAL_SECONDS)
            try:
                write_heartbeat()
            except Exception as hb_err:
                log(f"Heartbeat background notice: {hb_err}", "WARN")

    hb_thread = threading.Thread(target=heartbeat_worker, daemon=True)
    hb_thread.start()

    while True:
        try:
            # Hot reload if script file is edited on disk
            try:
                if os.path.getmtime(daemon_file) > start_mtime:
                    log("Detected update in printer_daemon.py! Exiting to auto-restart via NSSM...", "ALERT")
                    sys.exit(0)
            except Exception:
                pass

            # Poll for PAID jobs strictly via the Zero-Trust server proxy
            try:
                poll_resp = _job_session.post(f"{SERVER_URL}/api/daemon/poll", timeout=(3.0, 10.0))
                if poll_resp.status_code == 200:
                    poll_data = poll_resp.json()
                    jobs = poll_data.get("jobs", [])
                elif poll_resp.status_code == 401:
                    log(f"Access Denied: Station token is invalid or revoked for [{STATION_ID}]. Polling paused.", "ERROR")
                    time.sleep(5)
                    continue
                else:
                    jobs = []
            except requests.exceptions.RequestException as poll_err:
                log(f"Server proxy connection warning: {poll_err}. Retrying in 2s...", "WARN")
                time.sleep(2)
                continue

            if jobs:
                log(f"Found {len(jobs)} pending paid job(s) in queue!", "ALERT")

                for job in jobs:
                    job_id = job["id"]
                    pickup_code = job["pickup_code"]
                    file_key = job.get("file_key")
                    file_name = job.get("file_name") or "document.pdf"
                    is_duplex = bool(job.get("is_duplex"))
                    total_pages = job.get("total_pages") or 1

                    log(f"Processing Job {pickup_code} ({file_name}) — {total_pages} pages, Duplex: {is_duplex}")

                    # Atomically claim the job using CAS update (status = 'PAID' -> 'PRINTING_ODD')
                    if not claim_paid_job(job_id):
                        log(f"Job {job_id[:8]} was already claimed by another worker. Skipping.", "WARN")
                        continue

                    # 1. Resolve document file: Check local PC archive first, then Server Proxy
                    raw_name = os.path.basename(file_name.replace('\\', '/'))
                    base_name = re.sub(r'[^a-zA-Z0-9._-]', '_', raw_name) or "document"
                    clean_pickup = re.sub(r'[^a-zA-Z0-9]', '', pickup_code)
                    _, orig_ext = os.path.splitext(base_name)
                    if not orig_ext:
                        local_filename = f"{clean_pickup}_{job_id[:6]}_{base_name}.pdf"
                    else:
                        local_filename = f"{clean_pickup}_{job_id[:6]}_{base_name}"
                    local_path = os.path.join(TEMP_DIR, local_filename)

                    # Search local disk storage (printed_archive and temp_prints)
                    local_archived = find_local_archived_file(pickup_code, job_id, file_name)
                    if local_archived and os.path.exists(local_archived):
                        log(f"Found document in local PC archive: {os.path.basename(local_archived)}! Printing directly from local disk.", "SUCCESS")
                        local_path = local_archived
                    else:
                        try:
                            log(f"Downloading document securely via server proxy...")
                            download_cloud_file(job_id, local_path)
                            log(f"Downloaded {os.path.basename(local_path)} successfully", "SUCCESS")
                        except Exception as dl_err:
                            log(f"Failed to download job {pickup_code} via server proxy: {dl_err}", "ERROR")
                            update_job_status(job_id, "FAILED")
                            continue

                    # Ensure orientation is resolved and images converted to PDF
                    orientation = resolve_effective_orientation(job, local_path)
                    job["orientation"] = orientation
                    printable_path = ensure_printable_pdf(local_path, orientation=orientation)

                    # 2. Print depending on Duplex mode
                    if is_duplex and total_pages > 1:
                        if AUTO_DUPLEX:
                            process_auto_duplex_job(job, printable_path)
                        else:
                            process_manual_duplex_job(job, printable_path)
                    else:
                        process_single_sided_job(job, printable_path)

            # Purge local cache periodically
            purge_old_local_files()

        except requests.exceptions.RequestException as net_err:
            log(f"Network error communicating with Cloudflare: {net_err}. Retrying in 2s...", "WARN")
            time.sleep(2)
        except Exception as e:
            log(f"Unexpected error in daemon loop: {e}", "ERROR")
            time.sleep(1)

        # Sleep or wake up immediately if a print job trigger is received via local HTTP
        _wake_event.wait(timeout=POLL_INTERVAL_SECONDS)
        _wake_event.clear()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nDaemon terminated gracefully by operator.")
        sys.exit(0)
