# PrintKurox WhatsApp Ingestion Bot

An automated WhatsApp listener for PrintKurox. When students or faculty forward documents (PDFs, Word docs, photos) to the WhatsApp number, this bot automatically:
1. Receives the file directly from WhatsApp without saving it to any phone storage.
2. Streams and stores it safely into Cloudflare R2 cloud storage.
3. Automatically counts the PDF pages.
4. Replies within 2 seconds with an instant, personalized print studio link.
5. When the student clicks the link, PrintKurox opens with the file already loaded and ready to print!

---

## 🚀 How to Start (Step-by-Step)

### Step 1: Launch the Bot
Double-click `start_whatsapp_bot.bat` in this folder (or `START_WHATSAPP_BOT.bat` in the project root).
Alternatively, from terminal:
```bash
cd daemon/whatsapp_bot
node whatsapp_bot.js
```

### Step 2: Link with WhatsApp (First-Time Setup)
1. A QR code will display in the terminal.
2. Open WhatsApp on the shop / station phone (`+91 69092 28847`).
3. Tap **Settings** (or 3 dots in the top right) → **Linked Devices** → **Link a Device**.
4. Scan the QR code shown on the screen.
5. You will see:
   ```
   [SUCCESS] PrintKurox WhatsApp Bot is ONLINE!
   Ready to receive documents forwarded by students.
   ```

### Step 3: Test It!
1. From any other phone, send or forward a PDF document (e.g. `Lab_Report.pdf`) to the WhatsApp number.
2. Within 2 seconds, you will receive an automatic reply:
   ```
   🖨️ PrintKurox AutoPrint — Document Received!
   📄 File: Lab_Report.pdf
   📊 Pages: 14 Pages
   👉 Tap here to customize & print: https://printkurox.com/?sharedKey=...
   ```
3. Tap the link on your phone: the Document Studio will open immediately with the document loaded!

---

## ⚙️ Configuration (.env)
Credentials and shop info are configured in `daemon/whatsapp_bot/.env`:
- `PUBLIC_KIOSK_URL`: Website URL (e.g. `https://printkurox.com` or local dev `http://localhost:3000`).
- `STATION_NAME`: Name displayed in WhatsApp messages (e.g. `Romen Xerox`).
- `R2_BUCKET_NAME`: Cloudflare R2 bucket for uploads.
- `R2_ACCESS_KEY_ID` & `R2_SECRET_ACCESS_KEY`: Cloudflare R2 credentials.

---

## 💡 Notes
- The login session is saved in `session_auth/`. Once scanned, it stays logged in across computer restarts without needing to scan the QR code again.
- If you ever need to change the WhatsApp account or re-link, simply delete the `session_auth` folder and restart the script.
