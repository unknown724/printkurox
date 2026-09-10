import os
import requests
from dotenv import load_dotenv

load_dotenv('daemon/.env')
load_dotenv('.env.local')

acc = os.getenv('CLOUDFLARE_ACCOUNT_ID') or '948fd75d8b84a5cf20559d6aa789d4dd'
tok = os.getenv('CLOUDFLARE_API_TOKEN')
db = os.getenv('CLOUDFLARE_D1_DATABASE_ID') or '3f4d4547-e86b-4cdd-a867-9ebba19c12c9'
url = f"https://api.cloudflare.com/client/v4/accounts/{acc}/d1/database/{db}/query"
headers = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

queries = [
    """CREATE TABLE IF NOT EXISTS printer_supplies (
        id INTEGER PRIMARY KEY DEFAULT 1,
        black_pages_remaining INTEGER DEFAULT 4500,
        color_pages_remaining INTEGER DEFAULT 7500,
        black_capacity INTEGER DEFAULT 4500,
        color_capacity INTEGER DEFAULT 7500,
        paper_sheets_remaining INTEGER DEFAULT 500,
        paper_capacity INTEGER DEFAULT 500,
        last_black_refill TEXT,
        last_color_refill TEXT,
        last_paper_refill TEXT,
        updated_at TEXT NOT NULL
    );""",
    """INSERT OR IGNORE INTO printer_supplies (id, black_pages_remaining, color_pages_remaining, black_capacity, color_capacity, paper_sheets_remaining, paper_capacity, last_black_refill, last_color_refill, last_paper_refill, updated_at)
    VALUES (1, 4500, 7500, 4500, 7500, 500, 500, datetime('now'), datetime('now'), datetime('now'), datetime('now'));""",
    """CREATE TABLE IF NOT EXISTS printer_telemetry (
        id INTEGER PRIMARY KEY DEFAULT 1,
        printer_name TEXT DEFAULT 'EPSON L3210 Series',
        is_online INTEGER DEFAULT 1,
        status_code INTEGER DEFAULT 2,
        status_text TEXT DEFAULT 'Normal',
        spooler_jobs INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
    );""",
    """INSERT OR IGNORE INTO printer_telemetry (id, printer_name, is_online, status_code, status_text, spooler_jobs, updated_at)
    VALUES (1, 'EPSON L3210 Series', 1, 2, 'Normal', 0, datetime('now'));"""
]

for q in queries:
    r = requests.post(url, headers=headers, json={"sql": q, "params": []})
    print("Status:", r.status_code, "Success:", r.json().get("success"))
