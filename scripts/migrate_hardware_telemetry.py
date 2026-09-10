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

# Add columns if they don't already exist
cols_to_add = [
    ("hardware_total_pages", "INTEGER DEFAULT 24741"),
    ("hardware_color_pages", "INTEGER DEFAULT 10828"),
    ("hardware_bw_pages", "INTEGER DEFAULT 13845"),
    ("hardware_serial", "TEXT DEFAULT 'X8HY012040'"),
    ("hardware_firmware", "TEXT DEFAULT 'XH19P5'"),
    ("hardware_first_printed", "TEXT DEFAULT '2022/12/13'"),
    ("hardware_synced_at", "TEXT DEFAULT '2026-09-10'"),
    ("printer_model", "TEXT DEFAULT 'Epson EcoTank L3212'"),
    ("bk_pct", "REAL DEFAULT 18.0"),
    ("c_pct", "REAL DEFAULT 55.0"),
    ("m_pct", "REAL DEFAULT 38.0"),
    ("y_pct", "REAL DEFAULT 18.0"),
    ("bk_pages_remaining", "INTEGER DEFAULT 810"),
    ("c_pages_remaining", "INTEGER DEFAULT 4125"),
    ("m_pages_remaining", "INTEGER DEFAULT 2850"),
    ("y_pages_remaining", "INTEGER DEFAULT 1350"),
]

for col, col_type in cols_to_add:
    sql = f"ALTER TABLE printer_supplies ADD COLUMN {col} {col_type};"
    r = requests.post(url, headers=headers, json={"sql": sql, "params": []})
    res = r.json()
    success = res.get("success")
    print(f"Adding {col}: {success}")

# Now update the row #1 with the exact calibrated values from the user's photos
update_sql = """
UPDATE printer_supplies
SET 
    hardware_total_pages = 24741,
    hardware_color_pages = 10828,
    hardware_bw_pages = 13845,
    hardware_serial = 'X8HY012040',
    hardware_firmware = 'XH19P5',
    hardware_first_printed = '2022/12/13',
    hardware_synced_at = datetime('now'),
    printer_model = 'Epson EcoTank L3212',
    bk_pct = 18.0,
    c_pct = 55.0,
    m_pct = 38.0,
    y_pct = 18.0,
    bk_pages_remaining = 810,
    c_pages_remaining = 4125,
    m_pages_remaining = 2850,
    y_pages_remaining = 1350,
    black_pages_remaining = 810,
    color_pages_remaining = 1350
WHERE id = 1;
"""
r = requests.post(url, headers=headers, json={"sql": update_sql, "params": []})
print("Updated calibrated row:", r.json().get("success"))

# Verify query
verify = requests.post(url, headers=headers, json={"sql": "SELECT * FROM printer_supplies WHERE id = 1;", "params": []})
print("Verified row:", verify.json().get("result", [{}])[0].get("results"))
