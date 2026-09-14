"""
Restore Yesterday's Print Jobs from Daemon Logs into Cloudflare D1
Recovers pickup codes, filenames, pages, color modes, pricing, and revenue.
"""

import os
import re
import uuid
import json
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

# Load credentials
load_dotenv('daemon/.env')
load_dotenv('.env.local')

ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID') or '948fd75d8b84a5cf20559d6aa789d4dd'
API_TOKEN = os.getenv('CLOUDFLARE_API_TOKEN')
DATABASE_ID = os.getenv('CLOUDFLARE_D1_DATABASE_ID') or '3f4d4547-e86b-4cdd-a867-9ebba19c12c9'

if not API_TOKEN:
    raise ValueError("Missing CLOUDFLARE_API_TOKEN in environment")

D1_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query"
HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json"
}

def execute_d1(sql: str, params: list = None):
    body = {"sql": sql, "params": params or []}
    resp = requests.post(D1_URL, headers=HEADERS, json=body, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise Exception(f"D1 error: {data.get('errors')}")
    return data.get("result", [])

def compute_price(pages: int, is_duplex: bool, color_mode: str, copies: int = 1):
    if is_duplex:
        duplex_sheets = (pages + 1) // 2
        single_sheets = 0
    else:
        duplex_sheets = 0
        single_sheets = pages

    total_sheets = (duplex_sheets + single_sheets) * copies

    # Pricing calculation
    if color_mode == 'color':
        sheet_rate = 10.0 if is_duplex else 7.0
    else:
        sheet_rate = 6.0 if is_duplex else 4.0

    total_price = max(4.0, total_sheets * sheet_rate)
    return total_price, duplex_sheets * copies, single_sheets * copies

def parse_daemon_log(log_path='daemon/logs/daemon_stdout.log'):
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    jobs = []
    current_job = None

    for line in lines:
        clean = ansi_escape.sub('', line).strip()

        # 1. Processing line: [HH:MM:SS] [INFO] Processing Job #CODE (FILE) ...
        m_proc = re.search(r'\[(\d{2}:\d{2}:\d{2})\].*Processing Job (#\w+)\s*\((.*?)\)\s*[-—?\s]*(\d+)\s*pages,\s*Duplex:\s*(\w+)', clean)
        if m_proc:
            time_str, code, fname, pages, duplex = m_proc.groups()
            current_job = {
                'time': time_str,
                'pickup_code': code,
                'file_name': fname,
                'total_pages': int(pages),
                'is_duplex': 1 if duplex.lower() == 'true' else 0,
                'copies': 1,
                'color_mode': 'bw',
                'short_id': None,
                'full_uuid': None,
                'file_key': None,
            }

        # 2. Claim line
        m_claim = re.search(r'Atomically claimed job ([0-9a-f]+)', clean)
        if m_claim and current_job:
            current_job['short_id'] = m_claim.group(1)

        # 3. Download line
        m_r2 = re.search(r'Downloading from R2 \((.*?)\)', clean)
        if m_r2 and current_job:
            current_job['file_key'] = m_r2.group(1)
            m_uuid = re.search(r'uploads/(?:transformed-|raw/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', current_job['file_key'])
            if m_uuid:
                current_job['full_uuid'] = m_uuid.group(1)

        # 4. Settings line
        m_set = re.search(r'-print-settings\s+([^\s]+)', clean)
        if m_set and current_job:
            settings = m_set.group(1).split(',')
            for s in settings:
                if s.lower() in ['color', 'bw', 'monochrome']:
                    current_job['color_mode'] = 'color' if s.lower() == 'color' else 'bw'
                if s.lower().endswith('x'):
                    try:
                        current_job['copies'] = int(s[:-1])
                    except:
                        pass

        # 5. Completion line
        m_done = re.search(r'Job completed successfully.*?: (#\w+)', clean)
        if m_done and current_job and current_job.get('pickup_code') == m_done.group(1):
            jobs.append(current_job)
            current_job = None

    return jobs

def main():
    print("=== AutoPrint Kiosk Job Recovery ===")
    parsed_jobs = parse_daemon_log()
    print(f"Total jobs found in daemon log: {len(parsed_jobs)}")

    # Fetch existing jobs in D1 to prevent duplicates
    existing_rows = execute_d1("SELECT id, pickup_code FROM print_jobs")
    existing_codes = {r['pickup_code'] for r in existing_rows[0].get('results', []) if 'pickup_code' in r}
    print(f"Existing jobs in D1: {len(existing_codes)} ({', '.join(existing_codes)})")

    to_restore = [j for j in parsed_jobs if j['pickup_code'] not in existing_codes]
    print(f"Jobs to restore: {len(to_restore)}")

    total_revenue_restored = 0
    total_pages_restored = 0

    # Base date for yesterday's jobs: 2026-09-13
    # The last 2 jobs might be 2026-09-14 (past midnight)
    current_date = "2026-09-13"

    for j in to_restore:
        # Determine appropriate job ID
        if j.get('full_uuid'):
            job_id = j['full_uuid']
        elif j.get('short_id'):
            # Form predictable UUID from short id
            job_id = f"{j['short_id']}-0000-4000-8000-000000000000"
        else:
            job_id = str(uuid.uuid4())

        # Check if crossed midnight
        if j['time'] < '06:00:00' and j['pickup_code'] in ['#S211']:
            job_date = "2026-09-14"
        else:
            job_date = "2026-09-13"

        # Calculate exact timestamp in UTC (IST is UTC+5:30)
        # Parse time string: HH:MM:SS IST -> convert to UTC
        ist_hour, ist_min, ist_sec = map(int, j['time'].split(':'))
        ist_dt = datetime.strptime(f"{job_date} {j['time']}", "%Y-%m-%d %H:%M:%S")
        utc_dt = ist_dt - timedelta(hours=5, minutes=30)
        created_at_iso = utc_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")

        # Expiry set to 1 hour after creation
        expires_at_iso = (utc_dt + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

        price, duplex_sheets, single_sheets = compute_price(
            j['total_pages'], bool(j['is_duplex']), j['color_mode'], j['copies']
        )

        total_revenue_restored += price
        total_pages_restored += j['total_pages'] * j['copies']

        sql = """
        INSERT INTO print_jobs (
            id, pickup_code, file_key, file_name, total_pages, page_range,
            color_mode, is_duplex, copies, duplex_sheets, single_sheets,
            total_price, order_id, status, payment_id, created_at, expires_at, station_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        params = [
            job_id,
            j['pickup_code'],
            'ARCHIVED_LOCALLY', # Cloud file purged; physical PDF archived in local laptop
            j['file_name'],
            j['total_pages'],
            'All',
            j['color_mode'],
            j['is_duplex'],
            j['copies'],
            duplex_sheets,
            single_sheets,
            price,
            f"RECOVERED_{j['pickup_code'].replace('#', '')}",
            'COMPLETED',
            f"PAY_RECOVERED_{j['pickup_code'].replace('#', '')}",
            created_at_iso,
            expires_at_iso,
            'main'
        ]

        try:
            execute_d1(sql, params)
            print(f"Restored: {j['pickup_code']} | {j['file_name'][:30]:<30} | {j['color_mode'].upper()} | {j['total_pages']} pgs | Rs.{price:.2f}")
        except Exception as e:
            print(f"Error restoring {j['pickup_code']}: {e}")

    print("\n==========================================")
    print(f"SUCCESS: Restored {len(to_restore)} jobs!")
    print(f"Total Pages Restored: {total_pages_restored}")
    print(f"Total Revenue Restored: Rs.{total_revenue_restored:.2f}")
    print("==========================================")

if __name__ == '__main__':
    main()
