import os
import sys
import json
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

# ---- CONFIGURATION ----
API_BASE_URL = "https://printkurox.vercel.app/api"
# For local testing, you can change this to:
# API_BASE_URL = "http://localhost:3000/api"

CONFIG_FILE = "station_config.json"

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_banner():
    print("=======================================")
    print("      PrintKurox Station Setup         ")
    print("=======================================")
    print("")

def setup_wizard():
    clear_screen()
    print_banner()
    print("Welcome to the PrintKurox Partner Network!")
    print("Let's get your printer connected to the cloud.\n")

    shop_name = input("1. Enter your Print Shop Name (e.g., Romen Xerox): ").strip()
    
    admin_pin = ""
    while len(admin_pin) != 4 or not admin_pin.isdigit():
        admin_pin = input("2. Create a 4-digit Admin PIN (used for your dashboard): ").strip()

    print("\nRegistering your station with the PrintKurox Cloud...")

    # Prepare payload
    data = json.dumps({
        "name": shop_name,
        "stationType": "shop",
        "adminPin": admin_pin,
        "duplexEnabled": 1
    }).encode('utf-8')

    req = urllib.request.Request(f"{API_BASE_URL}/daemon/register", data=data, headers={'Content-Type': 'application/json'})
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)

            if res_json.get("success"):
                config = {
                    "station_id": res_json["station_id"],
                    "station_token": res_json["station_token"],
                    "shop_name": shop_name
                }
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(config, f, indent=4)
                
                print(f"\n[SUCCESS] Station Registered Successfully!")
                print(f"Station ID: {res_json['station_id']}")
                print(f"Your dashboard is ready at: https://printkurox.vercel.app/admin/{res_json['station_id']}")
                print("\nStarting the background printer daemon in 5 seconds...\n")
                time.sleep(5)
                return config
            else:
                print(f"\n[ERROR] Failed to register: {res_json}")
                sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Network error during setup: {e}")
        print("Please check your internet connection and try again.")
        sys.exit(1)

def run_daemon(config):
    station_id = config["station_id"]
    station_token = config["station_token"]
    shop_name = config.get("shop_name", station_id)

    clear_screen()
    print_banner()
    print(f"Station: {shop_name} ({station_id})")
    print(f"Status: ONLINE and waiting for print jobs...")
    print("---------------------------------------")

    headers = {
        'Content-Type': 'application/json',
        'x-station-token': station_token
    }

    last_heartbeat = 0
    HEARTBEAT_INTERVAL = 30 # seconds
    POLL_INTERVAL = 5 # seconds

    while True:
        try:
            current_time = time.time()

            # 1. Send Heartbeat to keep station "Online" on the website
            if current_time - last_heartbeat > HEARTBEAT_INTERVAL:
                hb_req = urllib.request.Request(f"{API_BASE_URL}/daemon/heartbeat", data=b'{}', headers=headers)
                urllib.request.urlopen(hb_req)
                last_heartbeat = current_time

            # 2. Poll for new jobs
            poll_req = urllib.request.Request(f"{API_BASE_URL}/daemon/poll?stationId={station_id}", headers=headers)
            with urllib.request.urlopen(poll_req) as response:
                poll_res = json.loads(response.read().decode('utf-8'))

                if poll_res.get("hasJob"):
                    job = poll_res["job"]
                    print(f"\n[NEW JOB] Received Job ID: {job['id']} | Pages: {job['total_pages']} | Amount: ₹{job['total_price']}")
                    
                    # 3. Claim the job (lock it to this station)
                    claim_data = json.dumps({"jobId": job["id"]}).encode('utf-8')
                    claim_req = urllib.request.Request(f"{API_BASE_URL}/daemon/claim", data=claim_data, headers=headers)
                    urllib.request.urlopen(claim_req)
                    
                    print(f"[PRINTING] Sending document to physical printer...")
                    
                    # Simulate printing delay (1 second per page)
                    time.sleep(job['total_pages'])
                    
                    print(f"[SUCCESS] Document printed successfully!")

                    # 4. Mark job as COMPLETED
                    complete_data = json.dumps({"status": "COMPLETED"}).encode('utf-8')
                    complete_req = urllib.request.Request(f"{API_BASE_URL}/status/{job['id']}", data=complete_data, headers={'Content-Type': 'application/json'})
                    # We have to patch the status route (using POST method override for compatibility)
                    complete_req.get_method = lambda: 'PATCH'
                    urllib.request.urlopen(complete_req)
                    
                    print("---------------------------------------")
                    print("Status: ONLINE and waiting for print jobs...")

            time.sleep(POLL_INTERVAL)

        except urllib.error.HTTPError as e:
            # Ignore 404s from the poll route if no jobs are found
            if e.code != 404:
                print(f"[WARNING] HTTP Error: {e.code} - {e.reason}")
            time.sleep(POLL_INTERVAL)
        except Exception as e:
            print(f"[WARNING] Network Error: {e}")
            time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    if not os.path.exists(CONFIG_FILE):
        config = setup_wizard()
    else:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            
    run_daemon(config)
