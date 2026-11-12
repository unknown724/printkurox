#!/usr/bin/env python3
"""
PrintKurox Embedded Hardware Print Daemon (Linux CUPS Edition)
============================================================
Designed specifically for Single-Board Computers (Orange Pi Zero 3, Raspberry Pi 4/5,
and Linux-based Mini-PCs) running headless in commercial kiosk enclosures.

Features:
- Native CUPS USB integration (zero Windows / SumatraPDF dependency)
- Automatic USB printer discovery via lpstat
- Supports EPSON (L3210/L3250), HP, Canon, Brother
- Adaptive Polling (12s idle / 2s active printing queue)
- Heartbeat & telemetry reporting to PrintKurox Cloud
- Auto-restart watchdog via systemd
"""

import os
import sys
import time
import json
import logging
import requests
import subprocess
import threading
import re
from datetime import datetime

# Base Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'station_config.json')
TEMP_DIR = os.path.join(BASE_DIR, 'temp_prints')
ARCHIVE_DIR = os.path.join(BASE_DIR, 'printed_archive')

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(ARCHIVE_DIR, exist_ok=True)

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.info
warn = logging.warning
error = logging.error

# Load Station Configuration
station_data = {}
if os.path.exists(CONFIG_PATH):
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            station_data = json.load(f)
            log(f"Loaded station config: {station_data.get('station_name')} [{station_data.get('station_id')}]")
    except Exception as e:
        error(f"Failed to read station_config.json: {e}")

STATION_ID = os.getenv('STATION_ID', station_data.get('station_id', 'block_b'))
STATION_TOKEN = os.getenv('STATION_TOKEN', station_data.get('station_token', ''))
SERVER_URL = os.getenv('SERVER_URL', station_data.get('server_url', 'https://printkurox.vercel.app')).rstrip('/')
CONFIGURED_PRINTER = os.getenv('PRINTER_NAME', station_data.get('printer_name', ''))
AUTO_DUPLEX = os.getenv('AUTO_DUPLEX', str(station_data.get('auto_duplex', 'false'))).lower() == 'true'
POLL_INTERVAL_SECONDS = int(os.getenv('POLL_INTERVAL_SECONDS', str(station_data.get('poll_interval_seconds', 12))))
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv('HEARTBEAT_INTERVAL_SECONDS', '30'))

_session = requests.Session()
_session.headers.update({
    "X-Station-Id": STATION_ID,
    "X-Station-Token": STATION_TOKEN,
    "User-Agent": f"PrintKurox-Linux-Daemon/2.0 ({STATION_ID})"
})


def get_available_cups_printers():
    """Queries CUPS for all available connected printers."""
    try:
        res = subprocess.run(['lpstat', '-e'], capture_output=True, text=True, timeout=5)
        printers = [p.strip() for p in res.stdout.strip().split('\n') if p.strip()]
        return printers
    except Exception as e:
        warn(f"Failed to query lpstat -e: {e}")
        return []


def resolve_target_printer():
    """Resolves printer: matches configured name, or auto-picks first CUPS USB printer."""
    available = get_available_cups_printers()
    if not available:
        warn("No CUPS printers found! Check USB connection to printer.")
        return None

    if CONFIGURED_PRINTER:
        # Check for exact or substring match (e.g. EPSON_L3210 matching EPSON_L3210_Series)
        clean_target = re.sub(r'[^a-zA-Z0-9]', '', CONFIGURED_PRINTER.lower())
        for p in available:
            clean_p = re.sub(r'[^a-zA-Z0-9]', '', p.lower())
            if clean_target in clean_p or clean_p in clean_target:
                return p

    # Fallback: Pick the first available printer
    selected = available[0]
    log(f"Auto-selected CUPS printer: {selected}")
    return selected


def print_pdf_cups(printer_name, file_path, copies=1, color_mode='bw', is_duplex=False, page_range=None):
    """Prints a PDF file using native Linux CUPS lp command."""
    cmd = ['lp']
    if printer_name:
        cmd.extend(['-d', printer_name])

    if copies and int(copies) > 1:
        cmd.extend(['-n', str(copies)])

    cmd.extend(['-o', 'fit-to-page'])

    # Color mode
    if color_mode == 'bw':
        cmd.extend(['-o', 'ColorModel=Grayscale'])
    else:
        cmd.extend(['-o', 'ColorModel=Color'])

    # Duplex
    if is_duplex and AUTO_DUPLEX:
        cmd.extend(['-o', 'sides=two-sided-long-edge'])
    else:
        cmd.extend(['-o', 'sides=one-sided'])

    # Page range (e.g., 1-5)
    if page_range and str(page_range).lower() != 'all':
        cmd.extend(['-o', f'page-ranges={page_range}'])

    cmd.append(file_path)

    log(f"Executing CUPS print: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    log(f"CUPS Output: {res.stdout.strip()}")
    return True


def claim_paid_job(job_id):
    """Atomically claims a paid job from the server proxy."""
    url = f"{SERVER_URL}/api/daemon/claim"
    try:
        resp = _session.post(url, json={"jobId": job_id}, timeout=(3.0, 10.0))
        if resp.status_code == 200:
            data = resp.json()
            return bool(data.get("claimed"))
    except Exception as e:
        warn(f"Server claim notice for {job_id[:8]}: {e}")
    return False


def download_cloud_file(job_id, destination_path):
    """Downloads the printable document from the server proxy."""
    url = f"{SERVER_URL}/api/daemon/job-file?jobId={job_id}"
    resp = _session.get(url, timeout=(5.0, 60.0), stream=True)
    resp.raise_for_status()
    with open(destination_path, 'wb') as f:
        for chunk in resp.iter_content(chunk_size=65536):
            if chunk:
                f.write(chunk)


def update_job_status(job_id, status, pages_printed=None, sheets_used=None):
    """Notifies the cloud platform of job status updates."""
    url = f"{SERVER_URL}/api/daemon/status"
    body = {
        "jobId": job_id,
        "status": status,
        "pagesPrinted": pages_printed,
        "sheetsUsed": sheets_used
    }
    try:
        _session.post(url, json=body, timeout=(3.0, 10.0))
    except Exception as e:
        warn(f"Status update network notice: {e}")


def write_heartbeat():
    """Sends telemetry and hardware status heartbeat to the cloud."""
    url = f"{SERVER_URL}/api/daemon/heartbeat"
    printers = get_available_cups_printers()
    is_printer_connected = len(printers) > 0

    body = {
        "station_id": STATION_ID,
        "is_online": 1 if is_printer_connected else 0,
        "status_text": f"Ready ({printers[0]})" if is_printer_connected else "Printer Disconnected",
        "device_info": "Linux SBC (Orange Pi / Pi 4)"
    }
    try:
        _session.post(url, json=body, timeout=(3.0, 8.0))
    except Exception:
        pass


def heartbeat_worker():
    """Background thread sending 30s heartbeats."""
    time.sleep(1.0)
    while True:
        try:
            write_heartbeat()
        except Exception:
            pass
        time.sleep(HEARTBEAT_INTERVAL_SECONDS)


def main():
    log(f"======================================================")
    log(f"PrintKurox Embedded Linux Daemon Starting")
    log(f"Station ID:    {STATION_ID}")
    log(f"Server URL:    {SERVER_URL}")
    log(f"Adaptive Poll: {POLL_INTERVAL_SECONDS}s idle / 2s active")
    log(f"======================================================")

    # Start background heartbeat thread
    t = threading.Thread(target=heartbeat_worker, daemon=True)
    t.start()

    last_poll_had_jobs = False

    while True:
        try:
            poll_resp = _session.post(f"{SERVER_URL}/api/daemon/poll", timeout=(3.0, 10.0))
            if poll_resp.status_code == 200:
                poll_data = poll_resp.json()
                jobs = poll_data.get("jobs", [])
            elif poll_resp.status_code == 401:
                error(f"Access Denied: Station token is invalid for [{STATION_ID}]. Check config.")
                time.sleep(10)
                continue
            else:
                jobs = []

            if jobs:
                last_poll_had_jobs = True
                log(f"Found {len(jobs)} pending print job(s) in queue!")

                target_printer = resolve_target_printer()
                if not target_printer:
                    error("Cannot print: No CUPS printer detected over USB! Waiting...")
                    time.sleep(5)
                    continue

                for job in jobs:
                    job_id = job["id"]
                    pickup_code = job.get("pickup_code", "#0000")
                    file_name = job.get("file_name", "document.pdf")
                    total_pages = job.get("total_pages", 1)
                    is_duplex = bool(job.get("is_duplex"))
                    color_mode = job.get("color_mode", "bw")
                    copies = job.get("copies", 1)
                    page_range = job.get("page_range", "All")

                    log(f"Processing Job {pickup_code} ({file_name}) — {total_pages} pgs, Copies: {copies}")

                    # Claim job
                    if not claim_paid_job(job_id):
                        warn(f"Job {job_id[:8]} was already claimed by another worker. Skipping.")
                        continue

                    # Download file
                    clean_name = re.sub(r'[^a-zA-Z0-9._-]', '_', file_name) or "doc.pdf"
                    local_pdf = os.path.join(TEMP_DIR, f"{pickup_code}_{job_id[:6]}_{clean_name}")

                    try:
                        download_cloud_file(job_id, local_pdf)
                        log(f"Downloaded document successfully: {os.path.basename(local_pdf)}")
                    except Exception as dl_err:
                        error(f"Failed to download job {pickup_code}: {dl_err}")
                        update_job_status(job_id, "FAILED")
                        continue

                    # Send to CUPS printer
                    try:
                        update_job_status(job_id, "PRINTING")
                        print_pdf_cups(
                            printer_name=target_printer,
                            file_path=local_pdf,
                            copies=copies,
                            color_mode=color_mode,
                            is_duplex=is_duplex,
                            page_range=page_range
                        )
                        update_job_status(job_id, "COMPLETED", pages_printed=total_pages, sheets_used=total_pages)
                        log(f"Successfully printed Job {pickup_code} on {target_printer}!", "SUCCESS")

                        # Archive locally
                        archive_path = os.path.join(ARCHIVE_DIR, os.path.basename(local_pdf))
                        os.replace(local_pdf, archive_path)
                    except Exception as print_err:
                        error(f"CUPS printing failed for {pickup_code}: {print_err}")
                        update_job_status(job_id, "FAILED")
            else:
                last_poll_had_jobs = False

        except requests.exceptions.RequestException as net_err:
            warn(f"Network glitch contacting server: {net_err}. Retrying...")
            time.sleep(3)
        except Exception as e:
            error(f"Unexpected error in daemon loop: {e}")
            time.sleep(2)

        # Adaptive sleep: 2s if jobs were found, otherwise idle sleep (12s)
        sleep_time = 2 if last_poll_had_jobs else POLL_INTERVAL_SECONDS
        time.sleep(sleep_time)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        log("Daemon terminated gracefully.")
        sys.exit(0)
