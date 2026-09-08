# AutoPrint Kiosk 🖨️
> Production-ready, mobile-first Web App and Windows Python Print Daemon for an automated, self-service print kiosk system.

---

## ⚡ Tech Stack
- **Frontend & Web Backend:** Next.js 14 (App Router, Turbopack, TypeScript, Tailwind CSS, Lucide Icons)
- **Database:** Cloudflare D1 (Serverless SQLite at the edge, Singapore region)
- **Object Storage:** Cloudflare R2 (S3-compatible bucket `kiosk-uploads`, $0 egress fees)
- **Payment Gateway:** Razorpay Checkout (UPI QR, Cards, NetBanking)
- **Print Daemon:** Windows Python 3 agent with SumatraPDF CLI silent print engine & Scenario B Manual Duplexing.

---

## 💰 Pricing Engine Logic (Strict)
- **Black & White:**
  - Single-sided: ₹4 per sheet (page)
  - Double-sided: ₹6 per double-sided sheet
- **Color:**
  - Single-sided: ₹7 per sheet (page)
  - Double-sided: ₹10 per double-sided sheet

### Odd Page Handling on Duplex:
When an odd number of pages (e.g., 5 pages) is submitted for duplex:
- `duplex_sheets = Math.floor(totalPages / 2)` (2 sheets)
- `single_sheets = totalPages % 2` (1 sheet)
- Total Price = `((duplex_sheets * duplex_rate) + (single_sheets * single_rate)) * copies`
- *B&W 5 pages duplex = (2 × ₹6) + (1 × ₹4) = ₹16 per copy*
- *Color 5 pages duplex = (2 × ₹10) + (1 × ₹7) = ₹27 per copy*

---

## 🚀 Quick Start Guide

### 1. Web App (Next.js)

```bash
# In the project root
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) on your mobile browser or desktop.

### 2. Windows Print Daemon (Shop Laptop)

```bash
cd daemon
pip install -r requirements.txt
python printer_daemon.py
```
*(Or double-click `start_daemon.bat` directly!)*

---

## 🛠️ SumatraPDF Setup (For the Laptop)
1. Download and install [SumatraPDF](https://www.sumatrapdfreader.org/download-free-pdf-viewer) (default path: `C:\Program Files\SumatraPDF\SumatraPDF.exe`).
2. If installed in a custom location, specify `SUMATRA_PATH` in `daemon/.env`.
3. If using a specific printer instead of the Windows default printer, set `PRINTER_NAME="Your Printer Name"` in `daemon/.env`.

---

## 🔒 15-Minute Privacy Policy
- Files uploaded to Cloudflare R2 are temporary.
- Every job records an `expires_at = created_at + 15 minutes`.
- Automated cleanup endpoint `/api/cron/cleanup` purges expired database records and deletes files from Cloudflare R2.
- The Python daemon also automatically purges any downloaded local files in `daemon/temp_prints/` older than 15 minutes.
