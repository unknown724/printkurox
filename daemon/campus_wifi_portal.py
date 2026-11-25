#!/usr/bin/env python3
"""
NERIST Cyberoam / Captive Portal Auto-Login Daemon for Raspberry Pi / Linux.
Reads CAMPUS_PORTAL_URL, CAMPUS_WIFI_USER, and CAMPUS_WIFI_PASS from .env on
each cycle so #wifi <user> <pass> changes via WhatsApp take effect immediately.
"""

import argparse
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ENV_CANDIDATES = [
    BASE_DIR / "whatsapp_bot" / ".env",
    BASE_DIR / ".env",
]


def load_env_values() -> dict[str, str]:
    vals: dict[str, str] = {}
    for env_path in ENV_CANDIDATES:
        if not env_path.is_file():
            continue
        try:
            for raw in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in vals:
                    vals[k] = v
        except Exception:
            pass
    return vals


def is_portal_reachable(portal_url: str, timeout: float = 4.0) -> bool:
    try:
        req = urllib.request.Request(portal_url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status in (200, 301, 302)
    except Exception:
        return False


def attempt_portal_login(portal_url: str, username: str, password: str) -> tuple[bool, str]:
    endpoint = f"{portal_url.rstrip('/')}/login.xml"
    payload = urllib.parse.urlencode(
        {
            "mode": "191",
            "username": username,
            "password": password,
            "a": str(int(time.time() * 1000)),
            "producttype": "0",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
    except Exception as exc:
        return False, f"Portal POST error: {exc}"

    status_match = re.search(r"<status[^>]*>\s*(?:<!\[CDATA\[)?\s*(\w+)", body, re.IGNORECASE)
    status_word = status_match.group(1).upper() if status_match else ""
    if status_word == "LIVE" or re.search(r"LIVE|signed\s*in|already", body, re.IGNORECASE):
        return True, f"Authenticated ({status_word or 'LIVE'}) as {username}"
    if re.search(r"DEAD|failed|invalid|wrong", body, re.IGNORECASE):
        return False, f"Portal rejected credentials for {username}: {body[:160]}"
    return False, f"Unexpected portal response: {body[:160]}"


_last_login_at = 0.0
KEEPALIVE_REFRESH_SECONDS = 600.0


def has_internet_access(timeout: float = 3.0) -> bool:
    """Fast connectivity probe to avoid posting Cyberoam login.xml every 45s when already LIVE."""
    try:
        req = urllib.request.Request("http://clients3.google.com/generate_204", method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 204
    except Exception:
        return False


def run_once(force_login: bool = False) -> None:
    global _last_login_at
    env = load_env_values()
    portal_url = env.get("CAMPUS_PORTAL_URL", "http://10.10.200.1:8090").rstrip("/")
    username = env.get("CAMPUS_WIFI_USER", "122148")
    password = env.get("CAMPUS_WIFI_PASS", "Tombinao123")

    if not force_login and has_internet_access():
        if time.monotonic() - _last_login_at < KEEPALIVE_REFRESH_SECONDS:
            return

    if not is_portal_reachable(portal_url):
        print(f"[Portal] {portal_url} not reachable (likely on phone hotspot / non-Cyberoam network).", flush=True)
        return

    ok, msg = attempt_portal_login(portal_url, username, password)
    if ok:
        _last_login_at = time.monotonic()
    print(f"[Portal] {'OK' if ok else 'WARN'}: {msg}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="PrintKurox NERIST Cyberoam Portal Keepalive")
    parser.add_argument("--once", action="store_true", help="Run one login check and exit")
    parser.add_argument("--interval", type=int, default=45, help="Loop interval in seconds (default: 45)")
    args = parser.parse_args()

    if args.once:
        run_once(force_login=True)
        return 0

    print("[Portal] NERIST Cyberoam Portal Keepalive daemon started.", flush=True)
    while True:
        try:
            run_once()
        except Exception as exc:
            print(f"[Portal] Unexpected error: {exc}", flush=True)
        time.sleep(max(15, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
