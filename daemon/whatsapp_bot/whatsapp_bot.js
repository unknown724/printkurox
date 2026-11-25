/**
 * PrintKurox WhatsApp Conversational Ingestion & Payment Bot Daemon
 * 
 * Features:
 * 1. Automatic document & photo ingestion with Cloudflare R2 buffering.
 * 2. Instant PDF page counting and orientation detection via pdf-lib.
 * 3. Native WhatsApp Interactive Action Buttons (Single-Card, Zero-Spam):
 *    - Step 1: Color Selection (1️⃣ Black & White vs 2️⃣ Color)
 *    - Step 2: Copies Selection (1️⃣ 1 Copy, 2️⃣ 2 Copies, 3️⃣ 3 Copies, 📑 Custom)
 *    - Step 3: Page Orientation (📐 Auto-Detect, 📄 Portrait, 📃 Landscape)
 *    - Step 4: Document Summary & Confirmation Card:
 *              [ ➡️ Proceed to Payment ] | [ 🔄 Reset / Change Settings ]
 *    - Step 5: Dedicated Payment Card:
 *              [ 💳 Pay Online (1-Tap UPI) ] | [ 💵 Pay Cash at Counter ]
 * 4. Frictionless Razorpay 1-Tap UPI:
 *    - Auto-prefills student's phone number or station helpline (9362980761).
 *    - upi_link: true bypasses mobile number prompt directly into GPay/PhonePe/Paytm.
 * 5. Instant Cash-at-counter option with automated printer release polling.
 * 6. Session Lifecycle & Expiration Guard (15-min timeout with recovery card).
 * 7. Real-time synchronization with Cloudflare D1 & Kiosk Printer Daemon.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  getKeyAuthor,
  normalizeMessageContent,
  proto,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PDFDocument, degrees } = require('pdf-lib');
const Razorpay = require('razorpay');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { convertDocxToPdf, findSoffice } = require('./docx_converter');
const { handleStudentMessage } = require('./student_bot_module');
const { handleFacultyMessage, isGroupFacultyCommand, getFacultySearchCount } = require('./faculty_bot_module');
const { handleAIChatMessage, activeDrafts, activeCoverDrafts, activeGameDrafts, readyToPrintDocs, saveCoverDraft, getCoverDraft, extractStudentQuery, isUserAdmin, recordAdaptiveCorrection, pendingDisambiguations, getUserProfile } = require('./ai_chat_module');
const { formatForWhatsApp, generateApplicationPdf, generateApplicationDocx, generateAssignmentCoverPdf, generateAssignmentCoverDocx, extractPureApplicationText, generateHtmlGame } = require('./document_generator');
const { handleServerAdminCommand, onBotConnectionOpen } = require('./server_controller_module');
const { generatePreviewImage } = require('./pdf_preview_renderer');
const { createAuthToken, validateAuthToken, startWebAuthServer, startCloudflaredTunnel, setOnAuthSuccess, getPublicAuthUrl } = require('./cinderac_web_auth');
const { getCinderacSession, saveCinderacSession, clearCinderacSession, syncStudentData, matchCinderacCourseSelection } = require('./cinderac_sync_module');

// Active studio tracker for numeric 1/2/3 selection (senderJid -> 'cover' | 'game' | 'app')
const userLastOpenedStudio = new Map();

// Dedicated diagnostic event log (avoids file-offset collision with stdout redirection on whatsapp_bot.log)
const BOT_LOG_FILE = path.join(__dirname, 'whatsapp_bot_events.log');
function appendBotLog(msg) {
  try {
    const ts = new Date().toISOString();
    if (fs.existsSync(BOT_LOG_FILE) && fs.statSync(BOT_LOG_FILE).size > 5 * 1024 * 1024) {
      fs.renameSync(BOT_LOG_FILE, BOT_LOG_FILE + '.old');
    }
    fs.appendFileSync(BOT_LOG_FILE, `[${ts}] ${msg}\n`, 'utf8');
  } catch (e) {}
}

// USB/SD Storage Cap Protection: keep bot logs capped & prune temp print artifacts older than 2 hours
function runBotStorageCleanup() {
  const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10 MB cap per log file
  const KEEP_TAIL_BYTES = 200 * 1024;
  for (const logName of ['whatsapp_bot.log', 'bot_live.log', 'bot_stdout_live.log', 'bot_stderr_live.log', 'whatsapp_bot_events.log.old']) {
    try {
      const logPath = path.join(__dirname, logName);
      if (!fs.existsSync(logPath)) continue;
      const st = fs.statSync(logPath);
      if (st.size > MAX_LOG_BYTES) {
        if (logName.endsWith('.old')) {
          fs.unlinkSync(logPath);
        } else {
          const fd = fs.openSync(logPath, 'r+');
          try {
            const buf = Buffer.alloc(KEEP_TAIL_BYTES);
            fs.readSync(fd, buf, 0, KEEP_TAIL_BYTES, st.size - KEEP_TAIL_BYTES);
            fs.ftruncateSync(fd, 0);
            fs.writeSync(fd, Buffer.from('\n--- [Log trimmed by PrintKurox storage guard] ---\n'));
            fs.writeSync(fd, buf, 0, KEEP_TAIL_BYTES);
          } finally {
            fs.closeSync(fd);
          }
        }
      }
    } catch (e) {}
  }

  const cutoffMs = Date.now() - 2 * 60 * 60 * 1000;
  for (const tempDir of [path.join(__dirname, '..', 'temp_prints'), path.join(__dirname, 'temp_prints'), path.join(__dirname, 'temp_media')]) {
    try {
      if (!fs.existsSync(tempDir)) continue;
      for (const entry of fs.readdirSync(tempDir)) {
        const fp = path.join(tempDir, entry);
        try {
          const st = fs.statSync(fp);
          if (st.isFile() && st.mtimeMs < cutoffMs) fs.unlinkSync(fp);
        } catch (e) {}
      }
    } catch (e) {}
  }
}
setTimeout(runBotStorageCleanup, 10000).unref();
setInterval(runBotStorageCleanup, 30 * 60 * 1000).unref();

// Configuration from .env
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'kiosk-uploads';
const PUBLIC_KIOSK_URL = process.env.PUBLIC_KIOSK_URL || 'https://printkurox.pages.dev';
const BOT_NAME = process.env.BOT_NAME || 'PrintKurox AutoPrint';

// Campus Stations Registry
const AVAILABLE_STATIONS = [
  { id: 'block_b', name: 'Hostel Block B (Pare)', room: 'Room 29, 1st Floor', contact: '9362980761', allowCounterPayment: false },
  { id: 'block_c', name: 'Hostel Block C (Dibang)', room: 'Ground Floor', contact: '9362980761', allowCounterPayment: false },
  { id: 'romen_xerox', name: 'Romen Xerox', room: 'Main Gate / Off-Campus', contact: '9362980761', allowCounterPayment: true },
];

// Default station auto-detected from station_config.json or environment
let defaultStation = {
  id: process.env.STATION_ID || 'block_b',
  name: process.env.STATION_NAME || 'Hostel Block B (Pare)',
  room: process.env.STATION_ROOM || 'Room 29, 1st Floor',
  contact: process.env.STATION_CONTACT || '9362980761',
  allowCounterPayment: false,
};

try {
  const stationConfigPath = path.join(__dirname, '..', 'station_config.json');
  if (fs.existsSync(stationConfigPath)) {
    const rawCfg = JSON.parse(fs.readFileSync(stationConfigPath, 'utf8'));
    if (rawCfg.station_id) defaultStation.id = rawCfg.station_id;
    if (rawCfg.station_name) defaultStation.name = rawCfg.station_name;
    if (rawCfg.room_info) defaultStation.room = rawCfg.room_info;
    if (rawCfg.contact) defaultStation.contact = rawCfg.contact;
    if (rawCfg.allow_counter_payment !== undefined) {
      defaultStation.allowCounterPayment = Boolean(rawCfg.allow_counter_payment);
    }
  }
} catch (cfgErr) {
  console.warn('[WA-Bot] station_config.json read notice:', cfgErr.message);
}

const STATION_NAME = defaultStation.name;
const STATION_ID = defaultStation.id;
const STATION_ROOM = defaultStation.room;
const STATION_CONTACT = defaultStation.contact;

// Cloudflare D1 Credentials
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_D1_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || '';

// Razorpay Credentials
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

// Validate Cloudflare R2 credentials
if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
  console.error('[PrintKurox WA Bot] ERROR: Missing Cloudflare R2 credentials in .env!');
  process.exit(1);
}

// Initialize S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Initialize Razorpay client
let razorpay = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
} else {
  console.warn('[WA-Bot] Warning: Razorpay credentials missing. UPI links will be simulated.');
}

// Interactive Action Buttons Definitions
const QUEUE_STAGING_BUTTONS = [
  { id: 'btn_queue_add_more', text: '➕ Upload More Files' },
  { id: 'btn_queue_continue', text: '➡️ Continue to Print' },
  { id: 'btn_queue_clear', text: '🗑️ Clear Queue' },
];

const STEP1_BUTTONS_STANDARD = [
  { id: 'btn_bw', text: '1️⃣ Black & White (₹4/p)' },
  { id: 'btn_color', text: '2️⃣ Color (₹7/p)' },
];

const STEP1_BUTTONS_BULK = [
  { id: 'btn_bw', text: '1️⃣ Black & White (₹3/p - Offer)' },
  { id: 'btn_color', text: '2️⃣ Color (₹5/p - Offer)' },
];

const STEP1_BUTTONS_PROMO_STANDARD = [
  { id: 'btn_bw', text: '1️⃣ Black & White (₹3/p - Promo)' },
  { id: 'btn_color', text: '2️⃣ Color (₹5/p - Promo)' },
];

const STEP1_BUTTONS_PROMO_BULK = [
  { id: 'btn_bw', text: '1️⃣ Black & White (₹2.50/p - Promo)' },
  { id: 'btn_color', text: '2️⃣ Color (₹4/p - Promo)' },
];

// Active secret promo code definition from official PrintKurox repo (src/lib/pricing.ts)
const VALID_PROMO_CODE = 'PARE2026';
function isValidPromoCode(code) {
  return typeof code === 'string' && code.trim().toUpperCase() === VALID_PROMO_CODE;
}

const STEP1_BUTTONS = STEP1_BUTTONS_STANDARD;

const STEP3_COPIES_BUTTONS = [
  { id: 'btn_copies_1', text: '1️⃣ 1 Copy' },
  { id: 'btn_copies_2', text: '2️⃣ 2 Copies' },
  { id: 'btn_copies_custom', text: '🔢 Custom Copies' },
];

const SUMMARY_CONFIRM_BUTTONS = [
  { id: 'btn_proceed_payment', text: '✅ Proceed to Payment' },
  { id: 'btn_view_preview', text: '👁️ Preview Document' },
  { id: 'btn_reset', text: '🔄 Reset / Change Settings' },
];

const STATION_BUTTONS = [
  { id: 'btn_station_block_b', text: '🏢 Block B (Pare)' },
  { id: 'btn_station_block_c', text: '🏢 Block C (Dibang)' },
  { id: 'btn_station_romen', text: '🏪 Romen Xerox' },
];

// In-Memory User Sessions Map (senderJid -> session)
const userSessions = new Map();

// In-Memory Multi-File Batch Buffer Map (normalizedJid -> { timer, files: [] })
const incomingFileBuffers = new Map();

// In-Memory Message Store for Baileys (msgId -> message)
const messageStore = new Map();
const botSentIds = new Set();

// Persistent incoming message deduplication (prevents replay loops across 50-min reconnects / restarts)
const PROCESSED_MSG_FILE = path.join(__dirname, 'processed_msg_ids.json');
const MAX_PROCESSED_MSG_IDS = 2500;
const STALE_MESSAGE_AGE_SEC = 300; // Ignore incoming messages older than 5 minutes on replay
const processedMsgIds = new Map();
let processedSaveTimer = null;

function loadProcessedMsgIds() {
  try {
    if (fs.existsSync(PROCESSED_MSG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PROCESSED_MSG_FILE, 'utf8'));
      if (Array.isArray(raw)) {
        for (const item of raw.slice(-MAX_PROCESSED_MSG_IDS)) {
          if (item && item.id) processedMsgIds.set(item.id, item.ts || Date.now());
        }
      }
    }
  } catch (e) {}
}
loadProcessedMsgIds();

function scheduleSaveProcessedMsgIds() {
  if (processedSaveTimer) clearTimeout(processedSaveTimer);
  processedSaveTimer = setTimeout(() => {
    try {
      const entries = Array.from(processedMsgIds.entries())
        .slice(-MAX_PROCESSED_MSG_IDS)
        .map(([id, ts]) => ({ id, ts }));
      fs.writeFile(PROCESSED_MSG_FILE, JSON.stringify(entries), 'utf8', () => {});
    } catch (e) {}
  }, 1500);
}

function hasProcessedMessage(msgId) {
  return Boolean(msgId && processedMsgIds.has(msgId));
}

function markMessageProcessed(msgId) {
  if (!msgId) return;
  processedMsgIds.set(msgId, Date.now());
  if (processedMsgIds.size > MAX_PROCESSED_MSG_IDS) {
    const first = processedMsgIds.keys().next().value;
    processedMsgIds.delete(first);
  }
  scheduleSaveProcessedMsgIds();
}

function getMessageTimestampSec(msg) {
  const ts = msg?.messageTimestamp;
  if (!ts) return 0;
  const num = typeof ts === 'object' && typeof ts.toNumber === 'function' ? ts.toNumber() : Number(ts);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
}

// Active Payment Link Pollers (jobId -> Interval)
const activePollers = new Map();

// Sliding window buffer of recent chat media attachments (last 5 minutes for Rescan & deduplication)
const recentChatMedia = new Map();
const RESCAN_WINDOW_MS = 5 * 60 * 1000; // 5-minute rolling window for chat attachment recovery

// Cancellation tracking to cleanly discard in-flight or delayed burst packets
const cancelledTimestamps = new Map();

/**
 * Universal Print Session Purge Helper:
 * Completely clears userSessions, pending burst incomingFileBuffers, and recentChatMedia.
 * Records a cancellation timestamp so any late-arriving packets or in-flight downloads are dropped.
 */
function purgeUserPrintSession(senderJid, normalizedJid) {
  const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
  const now = Date.now();
  if (norm) {
    cancelledTimestamps.set(norm, now);
    if (incomingFileBuffers.has(norm)) {
      const entry = incomingFileBuffers.get(norm);
      if (entry && entry.timer) clearTimeout(entry.timer);
      incomingFileBuffers.delete(norm);
    }
    recentChatMedia.delete(norm);
  }
  if (senderJid) {
    cancelledTimestamps.set(senderJid, now);
  }

  const session = (senderJid && userSessions.get(senderJid)) || (norm && userSessions.get(norm));
  if (session) {
    if (session.jobId && activePollers.has(session.jobId)) {
      clearInterval(activePollers.get(session.jobId));
      activePollers.delete(session.jobId);
    }
    if (session.queuedFiles) session.queuedFiles = [];
  }
  if (senderJid) userSessions.delete(senderJid);
  if (norm) userSessions.delete(norm);

  console.log(`[WA-Bot] 🧹 Purged all print session data, file buffers, and media history for ${norm || senderJid}`);
}

console.log('============================================================');
console.log(`       ${BOT_NAME} — Conversational Ingestion & Payment Daemon`);
console.log(`       Target Station: ${STATION_NAME} (${STATION_ID})`);
console.log(`       Live Web App:   ${PUBLIC_KIOSK_URL}`);
console.log(`       Storage:        Cloudflare R2 [${R2_BUCKET_NAME}]`);
console.log(`       Payment:        Razorpay UPI (${RAZORPAY_KEY_ID ? 'Connected' : 'Disabled'})`);
console.log('============================================================\n');

// ============================================================================
// HELPER FUNCTIONS: D1 DATABASE, PRICING, & PICKUP CODES
// ============================================================================

async function executeD1(sql, params = []) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_D1_DB_ID) return false;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DB_ID}/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('[WA-Bot D1 Execute Error]:', txt);
      return false;
    }
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('[WA-Bot D1 Network Error]:', err);
    return false;
  }
}

async function queryD1(sql, params = []) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_D1_DB_ID) return [];
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DB_ID}/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.result?.[0]?.results || [];
  } catch (err) {
    console.error('[WA-Bot D1 Query Error]:', err);
    return [];
  }
}

function generateRandomPickupCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const letter1 = letters[Math.floor(Math.random() * letters.length)];
  const letter2 = letters[Math.floor(Math.random() * letters.length)];
  const randomNumber = Math.floor(Math.random() * 900) + 100;
  return `#${letter1}${letter2}${randomNumber}`;
}

function parsePageRange(input, maxPages) {
  if (!input) return { pages: [], outOfBounds: [], isValid: false };
  let str = String(input).trim().toLowerCase();

  if (str === 'all' || str === 'full' || str === 'everything') {
    return { pages: Array.from({ length: maxPages }, (_, i) => i + 1), outOfBounds: [], isValid: true };
  }

  if (/\bodd\b/i.test(str)) {
    const pages = [];
    for (let i = 1; i <= maxPages; i += 2) pages.push(i);
    return { pages, outOfBounds: [], isValid: true };
  }

  if (/\beven\b/i.test(str)) {
    const pages = [];
    for (let i = 2; i <= maxPages; i += 2) pages.push(i);
    return { pages, outOfBounds: [], isValid: true };
  }

  // Clean up natural language words:
  // Remove 'pages', 'page', 'p.', 'p', '#'
  str = str.replace(/\bpages?\b|\bp\.?\b|#/gi, ' ');
  // Convert 'and', '&', 'with', '+' to commas
  str = str.replace(/\band\b|&|\bwith\b|\+/gi, ',');
  // Convert 'to', 'through' to hyphens
  str = str.replace(/\bto\b|\bthrough\b/gi, '-');
  // Convert space-separated numbers like '1 3' into '1, 3'
  str = str.replace(/(?<=\d)\s+(?=\d)/g, ',');

  const pagesSet = new Set();
  const outOfBounds = [];
  const parts = str.split(',').map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
          if (i >= 1 && i <= maxPages) pagesSet.add(i);
          else outOfBounds.push(i);
        }
      }
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p)) {
        if (p >= 1 && p <= maxPages) pagesSet.add(p);
        else outOfBounds.push(p);
      }
    }
  }

  const pages = Array.from(pagesSet).sort((a, b) => a - b);
  return {
    pages,
    outOfBounds: Array.from(new Set(outOfBounds)).sort((a, b) => a - b),
    isValid: pages.length > 0,
  };
}

function formatPageRange(pages) {
  if (!pages || pages.length === 0) return 'None';
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

const LID_MAPPING_DIRS = [
  path.join(__dirname, 'session_auth'),
  'c:\\Users\\Devananda Wahengbam\\Desktop\\whatsappbot\\session_auth',
  'c:\\Users\\Devananda Wahengbam\\Desktop\\whatsappbot\\session_auth_business',
];

function resolveLidToPhone(lid) {
  if (!lid) return null;
  // Strip device suffixes like _1, :1, etc. before stripping non-digits
  const baseLid = String(lid).split(/[_:]/)[0].replace(/[^0-9]/g, '');
  if (!baseLid) return null;
  if (baseLid === '60769525878871') return '9863013886';
  if (baseLid === '261469505642610') return '9362980761';
  if (lidMappingCache.has(baseLid)) {
    return lidMappingCache.get(baseLid).split('@')[0].replace(/[^0-9]/g, '').slice(-10);
  }
  // Check user_activity_log.json for live mapped phone numbers
  try {
    const act = loadUserActivityLog();
    for (const [phone, item] of Object.entries(act)) {
      if (item.jid && item.jid.includes(baseLid)) {
        const clean = phone.replace(/[^0-9]/g, '').slice(-10);
        if (/^[6-9]\d{9}$/.test(clean)) {
          lidMappingCache.set(baseLid, `91${clean}@s.whatsapp.net`);
          return clean;
        }
      }
    }
  } catch (e) {}

  for (const dir of LID_MAPPING_DIRS) {
    const revFile = path.join(dir, `lid-mapping-${baseLid}_reverse.json`);
    if (fs.existsSync(revFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(revFile, 'utf8'));
        const clean = String(raw).replace(/[^0-9]/g, '').slice(-10);
        if (/^[6-9]\d{9}$/.test(clean)) {
          lidMappingCache.set(baseLid, `91${clean}@s.whatsapp.net`);
          return clean;
        }
      } catch (e) {}
    }
  }
  return null;
}

async function resolveUserPhone(sock, senderJid) {
  if (!senderJid) return null;
  let raw = '';
  if (senderJid.endsWith('@s.whatsapp.net')) {
    raw = senderJid.split('@')[0].replace(/[^0-9]/g, '');
  } else if (senderJid.endsWith('@lid')) {
    const lidNum = senderJid.split('@')[0];
    const resolved = resolveLidToPhone(lidNum);
    if (resolved) {
      raw = resolved;
    } else if (sock?.signalRepository?.lidMapping?.getPNForLID) {
      try {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(senderJid);
        if (pn) {
          raw = String(pn).split('@')[0].replace(/[^0-9]/g, '');
          lidMappingCache.set(lidNum, `${raw}@s.whatsapp.net`);
        }
      } catch (e) {}
    }
  }
  if (raw && raw.length >= 10) {
    const tenDigit = raw.slice(-10);
    if (/^[6-9]\d{9}$/.test(tenDigit)) {
      return tenDigit;
    }
  }
  return null;
}

/**
 * Check if a session has expired (15 minutes timeout)
 */
function isSessionExpired(session) {
  if (!session) return true;
  const maxAgeMs = 15 * 60 * 1000;
  return (Date.now() - session.timestamp) > maxAgeMs;
}

/**
 * Send polite Session Expired notification
 */
async function sendSessionExpiredMessage(sock, senderJid) {
  const expiredText =
    `⏳ *Session Expired*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `This print session has timed out for security.\n\n` +
    `📄 *To print your document:*\n` +
    `Simply forward your PDF or photo to this chat again to start fresh!\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏢 *Station:* ${STATION_NAME} (${STATION_ROOM})`;

  await sock.sendMessage(senderJid, { text: expiredText });
}

// ============================================================================
// NATIVE FLOW ACTION BUTTONS DISPATCHER (ZERO DUPLICATE MESSAGES)
// ============================================================================

// In-Memory LID Mapping Cache to eliminate synchronous disk reads on every message
const lidMappingCache = new Map();

/**
 * Dispatch single-card native WhatsApp action buttons (IndiGo-style tap buttons)
 * Injects binary XML envelope (<biz><interactive ...> + <bot ...>)
 */
async function sendInteractiveButtons({ sock, jid, title, body, footer = 'PrintKurox AutoPrint', buttons = [] }) {
  if (!jid || !body) return null;
  const liveSock = (typeof activeBotSock !== 'undefined' && activeBotSock && activeBotSock.ws?.readyState === 1) ? activeBotSock : sock;
  sock = liveSock;

  const targetJid = jid;
  const cleanTitle = title ? title.replace(/^\*+|\*+$/g, '').trim() : '';
  const formattedBody = formatForWhatsApp(body);

  const nativeButtons = (buttons || []).map((btn) => {
    if (btn.url) {
      return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          url: btn.url,
          merchant_url: btn.url,
        }),
      };
    }
    if (btn.copyCode) {
      return {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text || '📋 Copy',
          id: btn.id || `copy_${Date.now()}`,
          copy_code: String(btn.copyCode),
        }),
      };
    }
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: btn.text,
        id: btn.id || btn.text,
      }),
    };
  });

  try {
    const waMsg = generateWAMessageFromContent(
      targetJid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: proto.Message.InteractiveMessage.fromObject({
              header: proto.Message.InteractiveMessage.Header.fromObject({
                title: cleanTitle || '',
                hasMediaAttachment: false,
              }),
              body: proto.Message.InteractiveMessage.Body.fromObject({
                text: formattedBody,
              }),
              footer: proto.Message.InteractiveMessage.Footer.fromObject({
                text: footer || 'PrintKurox AutoPrint',
              }),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: nativeButtons,
              }),
            }),
          },
        },
      },
      { userJid: sock.user?.id }
    );

    const additionalNodes = [
      {
        tag: 'biz',
        attrs: {},
        content: [
          {
            tag: 'interactive',
            attrs: {
              type: 'native_flow',
              v: '1',
            },
            content: [
              {
                tag: 'native_flow',
                attrs: {
                  name: 'mixed',
                  v: '9',
                },
              },
            ],
          },
        ],
      },
    ];

    await sock.relayMessage(targetJid, waMsg.message, {
      messageId: waMsg.key.id,
      additionalNodes,
    });

    if (waMsg?.key?.id) {
      botSentIds.add(waMsg.key.id);
      if (waMsg.message) messageStore.set(waMsg.key.id, waMsg.message);
    }
    appendBotLog(`[sendInteractiveButtons] ✅ Delivered native interactive quick reply buttons to ${targetJid} (msgId: ${waMsg?.key?.id || 'unknown'})`);
    return waMsg;
  } catch (btnErr) {
    appendBotLog(`[sendInteractiveButtons] ⚠️ Native button relay error to ${targetJid}: ${btnErr.message}, falling back to text`);
    const header = cleanTitle ? `*${cleanTitle}*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` : '';
    let optionsText = '';
    if (buttons && buttons.length > 0) {
      optionsText = buttons.map((b, idx) => {
        if (b.url) return `• 🔗 *${b.text}:*\n  ${b.url}`;
        return `• [${b.text}] (Reply: \`${b.id || idx + 1}\`)`;
      }).join('\n\n');
    }
    const footerText = footer ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n_${footer}_` : '';
    const fullText = `${header}${body}\n\n${optionsText}${footerText}`.trim();
    return await sock.sendMessage(targetJid, { text: fullText });
  }
}

// ============================================================================
// ADMIN PROMOTION & DIRECTORY BROADCAST HELPER
// ============================================================================
const ADMIN_NUMBERS = ['9863013886', '9362980761'];
const ADMIN_LIDS = ['60769525878871'];
const PROMO_LOG_FILE = path.join(__dirname, 'sent_promo_recipients.json');
const USER_ACTIVITY_LOG_FILE = path.join(__dirname, 'user_activity_log.json');

// In-Memory Campaign Staging State for Admin (adminJid -> { timeframeLabel, hours, recipients: [], isAwaitingRemoval: bool })
const adminCampaignState = new Map();

function isSenderAdmin(senderJid, normalizedJid, isMessageToSelf, resolvedPhone = null) {
  if (isMessageToSelf) return true;
  if (resolvedPhone && ADMIN_NUMBERS.includes(resolvedPhone.slice(-10))) return true;
  if (!senderJid && !normalizedJid) return false;
  if (ADMIN_LIDS.some((lid) => (senderJid && senderJid.includes(lid)) || (normalizedJid && normalizedJid.includes(lid)))) {
    return true;
  }
  return ADMIN_NUMBERS.some(num => (senderJid && senderJid.includes(num)) || (normalizedJid && normalizedJid.includes(num)));
}

let phoneToNameCache = null;
function getStudentNameByPhone(cleanPhone) {
  if (!cleanPhone) return 'Student';
  const tenDigit = cleanPhone.replace(/[^0-9]/g, '').slice(-10);
  if (!phoneToNameCache) {
    phoneToNameCache = new Map();
    try {
      const sPath = path.join(__dirname, 'students.json');
      if (fs.existsSync(sPath)) {
        const raw = JSON.parse(fs.readFileSync(sPath, 'utf8'));
        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (item.mobile && item.full_name) {
              const p = item.mobile.replace(/[^0-9]/g, '').slice(-10);
              if (/^[6-9]\d{9}$/.test(p)) {
                phoneToNameCache.set(p, item.full_name);
              }
            }
          }
        }
      }
    } catch (e) {}
  }
  return phoneToNameCache.get(tenDigit) || 'Student';
}

function getStudentDirectoryPromoCard() {
  const title = '🌟 *NERIST CAMPUS DIRECTORY* · 2026 Edition';
  const body =
    `*Connect with any NERIST student in seconds!*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👋 Hey NERISTian!\n\n` +
    `Need to reach a batchmate, find a senior's roll number, or connect with a classmate across departments?\n\n` +
    `Stop asking around in 10 different WhatsApp groups! The *Official NERIST Student Directory* is now integrated directly into this bot:\n\n` +
    `⚡ *What you can search instantly:*\n` +
    `  🔍 *Name & Roll Number:* Look up any student across all batches\n` +
    `  📞 *Direct Contact Info:* Verified phone numbers & branch records\n` +
    `  🎓 *Batch & Stream Info:* Degree, Diploma, Base Module & Forestry\n` +
    `  🔒 *Fast & Confidential:* 100% instant within this WhatsApp chat\n\n` +
    `👉 *Tap below to try a search right now:*`;

  const buttons = [
    { id: 'btn_flow_student', text: '🔍 Search Student Directory' },
    { id: 'btn_flow_printing', text: '🖨️ Print Documents' },
  ];

  return { title, body, buttons, footer: 'PrintKurox Student Services · NERIST Campus' };
}

function loadSentPromoLog() {
  try {
    if (fs.existsSync(PROMO_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(PROMO_LOG_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function recordSentPromo(phone) {
  try {
    const log = loadSentPromoLog();
    log[phone] = new Date().toISOString();
    fs.writeFileSync(PROMO_LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
  } catch (e) {}
}

function loadUserActivityLog() {
  try {
    if (fs.existsSync(USER_ACTIVITY_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(USER_ACTIVITY_LOG_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function recordUserActivity(phone, senderJid, name) {
  if (!phone) return;
  try {
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) return;
    const log = loadUserActivityLog();
    log[cleanPhone] = {
      phone: cleanPhone,
      jid: senderJid || `91${cleanPhone}@s.whatsapp.net`,
      name: name && name !== 'Student' ? name : (log[cleanPhone]?.name || 'Student'),
      lastActive: new Date().toISOString(),
    };
    fs.writeFileSync(USER_ACTIVITY_LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
  } catch (e) {}
}

function parseTimeframeHours(inputStr) {
  if (!inputStr) return { hours: 24, label: '24 Hours' };
  const str = inputStr.toLowerCase().trim();

  if (str === 'all' || str.includes('all')) {
    return { hours: 0, label: 'All Contacts' };
  }

  if (str.includes('today')) {
    const now = new Date();
    const hoursSinceMidnight = now.getHours() + (now.getMinutes() / 60);
    return { hours: Math.max(1, Math.ceil(hoursSinceMidnight)), label: 'Today' };
  }

  const hMatch = str.match(/(\d+)\s*(?:hours?|hrs?|h)\b/);
  if (hMatch) {
    const h = parseInt(hMatch[1], 10);
    return { hours: h, label: `${h} Hours` };
  }

  const dMatch = str.match(/(\d+)\s*(?:days?|d)\b/);
  if (dMatch) {
    const d = parseInt(dMatch[1], 10);
    return { hours: d * 24, label: `${d} Day${d > 1 ? 's' : ''}` };
  }

  const wMatch = str.match(/(\d+)\s*(?:weeks?|w)\b/);
  if (wMatch) {
    const w = parseInt(wMatch[1], 10);
    return { hours: w * 24 * 7, label: `${w} Week${w > 1 ? 's' : ''}` };
  }

  const bareNum = str.match(/\b(\d+)\b/);
  if (bareNum) {
    const n = parseInt(bareNum[1], 10);
    return { hours: n, label: `${n} Hours` };
  }

  return { hours: 24, label: '24 Hours' };
}

/**
 * Discovers contacts who personally messaged this bot number within the specified timeframe.
 * Strictly sources from user_activity_log.json (direct 1-on-1 private WhatsApp messages).
 */
async function getActiveStudentsInTimeframe(hours = 24, sock = null) {
  const cutoffMs = hours > 0 ? (Date.now() - (hours * 60 * 60 * 1000)) : 0;
  const foundMap = new Map();

  // 1. Direct 1-on-1 private messages logged live in user_activity_log.json
  const activityLog = loadUserActivityLog();
  for (const [phone, item] of Object.entries(activityLog)) {
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) continue;

    // Exclude bot itself and admin numbers
    if (ADMIN_NUMBERS.includes(cleanPhone)) continue;
    if (cleanPhone === '9362980761' || cleanPhone === '9863013886') continue;

    const activeTime = new Date(item.lastActive || 0).getTime();
    if (cutoffMs === 0 || activeTime >= cutoffMs) {
      const studentName = (item.name && item.name !== 'Student' && item.name !== 'WhatsApp User')
        ? item.name
        : getStudentNameByPhone(cleanPhone);
      const validName = (studentName && studentName !== 'Student' && studentName !== 'WhatsApp User') ? studentName : null;
      foundMap.set(cleanPhone, {
        phone: cleanPhone,
        jid: item.jid || `91${cleanPhone}@s.whatsapp.net`,
        name: validName,
        lastActive: item.lastActive,
      });
    }
  }

  // 1b. Check user_quotas.json for active students who used services recently
  try {
    const quotasPath = path.join(__dirname, 'user_quotas.json');
    if (fs.existsSync(quotasPath)) {
      const quotas = JSON.parse(fs.readFileSync(quotasPath, 'utf8'));
      for (const [key, q] of Object.entries(quotas)) {
        const clean = key.replace(/[^0-9]/g, '').slice(-10);
        if (/^[6-9]\d{9}$/.test(clean) && !ADMIN_NUMBERS.includes(clean) && clean !== '9362980761' && clean !== '9863013886') {
          if (q.lastDate) {
            const dateMs = new Date(q.lastDate).getTime();
            if (cutoffMs === 0 || dateMs >= cutoffMs || q.lastDate === new Date().toISOString().slice(0, 10)) {
              if (!foundMap.has(clean)) {
                const sName = getStudentNameByPhone(clean);
                const validName = (sName && sName !== 'Student' && sName !== 'WhatsApp User') ? sName : null;
                foundMap.set(clean, {
                  phone: clean,
                  jid: `91${clean}@s.whatsapp.net`,
                  name: validName,
                  lastActive: q.lastDate + 'T12:00:00.000Z',
                });
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  return Array.from(foundMap.values()).sort(
    (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
  );
}

/**
 * Dispatches the Campaign Audience Review card with guaranteed 0ms text display and disambiguous action buttons
 */
async function sendCampaignReviewCard({ sock, adminJid, campaign, noticeText = '' }) {
  const count = campaign.recipients.length;
  let listStr = '';

  campaign.recipients.forEach((r, idx) => {
    const phone = r.phone.slice(-10);
    const hasValidName = r.name && r.name !== 'Student' && r.name !== 'WhatsApp User';
    const line = hasValidName ? `${idx + 1}. *+91 ${phone}* (${r.name})` : `${idx + 1}. *+91 ${phone}*`;
    listStr += `${line}\n`;
  });

  const botPhone = '9362980761';
  const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : `91${botPhone}@s.whatsapp.net`;
  const isSelf =
    adminJid === 'self' ||
    adminJid.includes('9362980761') ||
    adminJid.includes('261469505642610') ||
    (sock.user?.id && adminJid.includes(sock.user.id.split('@')[0])) ||
    (sock.user?.lid && adminJid.includes(sock.user.lid.split('@')[0]));

  const targetSendJid = isSelf ? myJid : adminJid;

  const cardTitle = `📋 Audience Review · ${campaign.timeframeLabel}`;
  const cardBody = count > 0
    ? `${noticeText ? `${noticeText}\n\n` : ''}` +
      `Found *${count}* contact(s) who personally messaged this bot:\n\n` +
      `${listStr.trim()}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *Total Audience:* *${count}* recipient(s)`
    : `${noticeText ? `${noticeText}\n\n` : ''}` +
      `⚠️ *No contacts remaining in this audience.*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Reply with numbers directly (e.g. \`@send 9863013886\`) or use \`@send 7d\` to expand search._`;

  const buttons = count > 0
    ? [
        { id: 'btn_campaign_send', text: `🚀 Send to All (${count})` },
        { id: 'btn_campaign_remove', text: '❌ Remove Numbers' },
        { id: 'btn_campaign_cancel', text: '🚫 Cancel Broadcast' },
      ]
    : [
        { id: 'btn_campaign_cancel', text: '🚫 Cancel' },
      ];

  await sendInteractiveButtons({
    sock,
    jid: targetSendJid,
    title: cardTitle,
    body: cardBody,
    footer: 'PrintKurox Campaign Manager',
    buttons,
  });
}

async function executeCampaignBroadcast({ sock, adminJid, campaign }) {
  if (!campaign || !campaign.recipients || campaign.recipients.length === 0) {
    await sock.sendMessage(adminJid, {
      text: `⚠️ *No recipients to send to.* Please start a new scan using *@send 24 hour*.`,
    });
    return;
  }

  const sentList = [];
  const skippedList = [];
  const total = campaign.recipients.length;

  await sock.sendMessage(adminJid, {
    text: `🚀 *Starting campaign dispatch to ${total} student(s)...*\n_Applying safe 2.5s anti-spam pacing between sends._`,
  });

  const promo = getStudentDirectoryPromoCard();

  for (let i = 0; i < campaign.recipients.length; i++) {
    const item = campaign.recipients[i];
    const phone = item.phone.slice(-10);
    const targetJid = item.jid || `91${phone}@s.whatsapp.net`;

    try {
      await sendInteractiveButtons({
        sock,
        jid: targetJid,
        title: promo.title,
        body: promo.body,
        footer: promo.footer,
        buttons: promo.buttons,
      });
      recordSentPromo(phone);
      sentList.push(`• +91 ${phone}${item.name && item.name !== 'Student' ? ` (${item.name})` : ''}`);
    } catch (err) {
      console.error(`[WA-Bot] Error sending promo to ${phone}:`, err.message);
      skippedList.push(`• +91 ${phone} _(Failed: ${err.message})_`);
    }

    if (i < campaign.recipients.length - 1) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  let reportText = `📢 *Broadcast Dispatch Summary*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  reportText += `📊 *Campaign Target:* ${campaign.timeframeLabel} (${total} contacts)\n\n`;
  if (sentList.length > 0) {
    reportText += `✅ *Delivered Successfully (${sentList.length}):*\n${sentList.join('\n')}\n\n`;
  }
  if (skippedList.length > 0) {
    reportText += `⚠️ *Delivery Issues (${skippedList.length}):*\n${skippedList.join('\n')}\n\n`;
  }
  reportText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n_Campaign complete._`;

  const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : '919362980761@s.whatsapp.net';
  const targetReplyJid = (adminJid === 'self' || adminJid.includes('9362980761') || adminJid.includes('261469505642610')) ? myJid : adminJid;
  await sock.sendMessage(targetReplyJid, { text: reportText });
}

async function sendStep1Buttons(sock, senderJid, fileName, totalPages, fileSizeMb, session) {
  if (!session) {
    session = userSessions.get(senderJid) || userSessions.get(jidNormalizedUser(senderJid));
  }
  const isBulk = totalPages >= 10;
  const isPromo = !!(session && session.promoApplied);
  const title = `*PrintKurox* · Color Selection`;

  let offerNotice = '';
  let buttonsToUse = STEP1_BUTTONS_STANDARD;

  if (isPromo) {
    if (isBulk) {
      offerNotice =
        `🎉 *Special Promotional Bulk Tariff Active!*\n` +
        `⚡ *B&W:* ₹2.50/page · 🎨 *Color:* ₹4/page\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      buttonsToUse = STEP1_BUTTONS_PROMO_BULK;
    } else {
      offerNotice =
        `🎉 *Promotional Discount Active!*\n` +
        `⚡ *B&W:* ₹3/page · 🎨 *Color:* ₹5/page\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      buttonsToUse = STEP1_BUTTONS_PROMO_STANDARD;
    }
  } else if (isBulk) {
    offerNotice =
      `🎉 *Special Volume Offer Applied (10+ pages)!*\n` +
      `⚡ *B&W:* ₹3/page · 🎨 *Color:* ₹5/page\n` +
      `_(Applies to single pages only)_\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    buttonsToUse = STEP1_BUTTONS_BULK;
  } else {
    offerNotice =
      `💡 *Tip:* 10+ pages unlock B&W for ₹3/p & Color for ₹5/p (single page)!\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    buttonsToUse = STEP1_BUTTONS_STANDARD;
  }

  const body =
    `📄 *File:* ${fileName}\n` +
    `📊 *Pages:* ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} (${fileSizeMb} MB)\n` +
    `📍 *Station:* ${defaultStation.name} (${defaultStation.room})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    offerNotice +
    `Select print color below:`;

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title,
    body,
    footer: 'PrintKurox AutoPrint',
    buttons: buttonsToUse,
  });
}

/**
 * Dispatch Step 2: Page Selection (Separated for multi-page documents)
 */
async function sendStep2PageButtons(sock, senderJid, session) {
  const modeLabel = session.colorMode === 'color' ? 'Color' : 'Black & White';
  const title = `*PrintKurox* · Pages to Print`;
  const body =
    `📄 *File:* ${session.fileName} (${session.totalPages} pages)\n` +
    `🖨️ *Mode:* ${modeLabel}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Choose pages to print:\n` +
    `• Tap an option below, or\n` +
    `• Reply *1* for *All Pages*\n` +
    `• Reply *2* for *Custom Range* (or reply *1, 3* directly)`;

  session.stage = 'AWAITING_PAGE_SELECTION';

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title,
    body,
    footer: 'PrintKurox AutoPrint',
    buttons: [
      { id: 'btn_pages_all', text: `📑 All Pages (1-${session.totalPages})` },
      { id: 'btn_pages_custom', text: '🔢 Custom Range' },
    ],
  });
}

/**
 * Dispatch Step 3: Copies Selection (Separated)
 */
async function sendStep3CopiesButtons(sock, senderJid, session) {
  const activePagesCount = session.selectedPages ? session.selectedPages.length : session.totalPages;
  const isDocBulk = activePagesCount >= 10;
  const modeLabel = session.colorMode === 'color' ? '🎨 Color' : '⚫ Black & White';
  const pagesLabel = session.pageRangeStr || `All (${session.totalPages}p)`;
  const title = `*PrintKurox* · Number of Copies`;
  const body =
    `📄 *File:* ${session.fileName}\n` +
    `📑 *Pages:* ${pagesLabel}\n` +
    `🖨️ *Mode:* ${modeLabel}\n` +
    (isDocBulk
      ? `🎉 *10+ Page Offer Active:* ₹${session.colorMode === 'color' ? 5 : 3}/p applied!\n`
      : `💡 *Volume Offer:* 10+ total printed pages (Pages × Copies) unlock *₹3/p* (B&W) or *₹5/p* (Color)!\n`) +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Select copies below, or reply with any number (e.g. *2*, *3*, *5*):`;

  session.stage = 'AWAITING_COPIES';

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title,
    body,
    footer: 'PrintKurox AutoPrint',
    buttons: STEP3_COPIES_BUTTONS,
  });
}

/**
 * Dispatch Step 4: Document Summary Card (Dedicated Step)
 * Natural orientation is automatically applied from the file's geometry
 */
/**
 * Dispatch Unified Order Summary & 1-Tap UPI Payment Card
 * - Merges Step 4 summary with Step 5 instant payment
 * - Auto-generates Razorpay UPI link (upi_link: true)
 * - Inserts pending job in Cloudflare D1
 * - Primary button is 1-Tap UPI payment; raw link included in body for 100% device compatibility
 * - Starts active background polling (3s interval, 10 min window)
 */
async function sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName = 'Student', session }) {
  const activePagesCount = session.selectedPages ? session.selectedPages.length : session.totalPages;
  const currentStation = session.station || defaultStation;
  const totalCopies = Math.max(1, parseInt(session.copies || 1, 10));
  const totalPrintedPages = activePagesCount * totalCopies;
  const isBulk = totalPrintedPages >= 10;
  const isPromo = !!session.promoApplied;
  const standardRate = session.colorMode === 'color' ? 7 : 4;

  let ratePerPage;
  if (isPromo) {
    // Official PrintKurox promo tariffs: <10 pgs: B&W ₹3.00, Color ₹5.00 | 10+ pgs: B&W ₹2.50, Color ₹4.00
    ratePerPage = session.colorMode === 'color' ? (isBulk ? 4 : 5) : (isBulk ? 2.5 : 3);
  } else {
    // Standard tariffs: <10 pgs: B&W ₹4.00, Color ₹7.00 | 10+ pgs: B&W ₹3.00, Color ₹5.00
    ratePerPage = session.colorMode === 'color' ? (isBulk ? 5 : 7) : (isBulk ? 3 : 4);
  }

  const rawAmount = totalPrintedPages * ratePerPage;
  const totalAmount = Math.max(1, Math.round(rawAmount * 100) / 100);
  const normalStandardCost = totalPrintedPages * standardRate;
  const totalSavings = (isPromo || isBulk) ? Math.max(0, Math.round((normalStandardCost - totalAmount) * 100) / 100) : 0;
  session.totalPrice = totalAmount;
  session.ratePerPage = ratePerPage;

  // Natural orientation: follows uploaded file's geometry directly
  const isLandscape = session.isLandscapeDefault;
  session.orientation = isLandscape ? 'landscape' : 'portrait';
  const orientLabel = isLandscape ? 'Landscape (Wide)' : 'Portrait (Vertical)';
  const printTypeLabel = session.colorMode === 'color' ? '🎨 Color' : '⚫ Black & White';

  const pickupCode = session.pickupCode || generateRandomPickupCode();
  const jobId = session.jobId || crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  let paymentLinkUrl = session.paymentLinkUrl || '';
  let paymentLinkId = session.paymentLinkId || '';

  // Auto-resolve phone number for Razorpay to skip phone input screen
  const prefillPhone = await resolveUserPhone(sock, senderJid);

  // Immediate typing feedback for responsive user feel
  sock.sendPresenceUpdate('composing', senderJid).catch(() => {});

  if (razorpay && !paymentLinkUrl) {
    const customerPayload = {
      name: senderName || 'Student',
    };
    if (prefillPhone) {
      customerPayload.contact = prefillPhone;
    }

    try {
      const rzpLink = await razorpay.paymentLink.create({
        amount: totalAmount * 100,
        currency: 'INR',
        accept_partial: false,
        description: `Print: ${session.fileName.slice(0, 30)} (${session.copies || 1}x, ${session.colorMode}, ${session.orientation || 'portrait'})`,
        customer: customerPayload,
        upi_link: true,
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: {
          station_id: currentStation.id,
          file_key: session.fileKey,
          file_name: session.fileName,
          pickup_code: pickupCode,
          sender_jid: senderJid,
          copies: String(session.copies || 1),
          page_range: session.pageRangeStr || 'All',
          orientation: session.orientation || 'portrait',
        },
      });

      paymentLinkUrl = rzpLink.short_url;
      paymentLinkId = rzpLink.id;
      console.log(`[WA-Bot] Razorpay link created (contact: ${customerPayload.contact || 'none'}): ${paymentLinkUrl}`);
    } catch (rzpErr) {
      console.error('[WA-Bot] Razorpay link creation initial error:', rzpErr.error?.description || rzpErr.message);
      // Auto-retry without contact parameter in case phone number format was rejected by Razorpay
      try {
        const rzpRetry = await razorpay.paymentLink.create({
          amount: totalAmount * 100,
          currency: 'INR',
          accept_partial: false,
          description: `Print: ${session.fileName.slice(0, 30)} (${session.copies || 1}x, ${session.colorMode})`,
          customer: { name: senderName || 'Student' },
          upi_link: true,
          notify: { sms: false, email: false },
          reminder_enable: false,
          notes: {
            station_id: currentStation.id,
            pickup_code: pickupCode,
            sender_jid: senderJid,
          },
        });
        paymentLinkUrl = rzpRetry.short_url;
        paymentLinkId = rzpRetry.id;
        console.log(`[WA-Bot] Razorpay retry succeeded without contact: ${paymentLinkUrl}`);
      } catch (retryErr) {
        console.error('[WA-Bot] Razorpay link retry failed:', retryErr.error?.description || retryErr.message);
      }
    }
  }

  // Guaranteed Fallback UPI payment URL if Razorpay API was unavailable
  if (!paymentLinkUrl) {
    const fallbackVpa = process.env.STATION_UPI_VPA || '9362980761@upi';
    paymentLinkUrl = `upi://pay?pa=${encodeURIComponent(fallbackVpa)}&pn=PrintKurox&am=${totalAmount}&cu=INR&tn=Print_${pickupCode}`;
    console.log(`[WA-Bot] Using Direct Fallback UPI Link: ${paymentLinkUrl}`);
  }

  // Pre-generate preview image in background so "Preview Document" responds in 0ms!
  if (session.fileBuffer || session.imageBuffer) {
    generatePreviewImage({
      inputBuffer: session.fileBuffer || session.imageBuffer,
      fileName: session.fileName,
      colorMode: session.colorMode || 'bw',
      selectedPages: session.selectedPages,
    }).catch(() => {});
  }

  // Save order to Cloudflare D1 in background (non-blocking for ultra-fast card dispatch)
  executeD1(
    `INSERT INTO print_jobs (
      id, pickup_code, file_key, file_name, total_pages, page_range,
      color_mode, is_duplex, copies, duplex_sheets, single_sheets,
      total_price, order_id, status, created_at, expires_at,
      orientation, station_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      jobId,
      pickupCode,
      session.fileKey,
      session.fileName,
      session.selectedPages ? session.selectedPages.length : session.totalPages,
      session.pageRangeStr || 'All',
      session.colorMode,
      0,
      session.copies || 1,
      0,
      (session.selectedPages ? session.selectedPages.length : session.totalPages) * (session.copies || 1),
      totalAmount,
      paymentLinkId || `WA_${jobId.slice(0, 8)}`,
      'PENDING_PAYMENT',
      now,
      expiresAt,
      session.orientation || 'portrait',
      currentStation.id,
    ]
  ).catch((d1Err) => {
    console.error('[WA-Bot D1 Background Insert Error]:', d1Err);
  });

  session.stage = 'AWAITING_PAYMENT';
  session.jobId = jobId;
  session.pickupCode = pickupCode;
  session.paymentLinkId = paymentLinkId;
  session.paymentLinkUrl = paymentLinkUrl;

  if (paymentLinkId) {
    monitorPaymentLink({
      sock,
      senderJid,
      paymentLinkId,
      jobId,
      pickupCode,
      fileName: session.fileName,
    });
  }

  const offerLabel = isPromo
    ? (isBulk ? ' · Promo Bulk Tariff' : ' · Promo Tariff')
    : (isBulk ? ' · Special Offer' : '');

  const summaryBody =
    `📄 *Document:* ${session.fileName}\n` +
    `🖨️ *Print Mode:* ${printTypeLabel} (₹${ratePerPage}/p${offerLabel})\n` +
    `📑 *Pages:* ${session.pageRangeStr || 'All'} (${activePagesCount} of ${session.totalPages})\n` +
    `🔢 *Copies:* ${totalCopies} ${totalCopies === 1 ? 'copy' : 'copies'}${totalCopies > 1 ? ` (${totalPrintedPages} total pages printed)` : ''}\n` +
    `📐 *Orientation:* ${orientLabel} (Natural)\n` +
    `📍 *Release Station:* ${currentStation.name} (${currentStation.room})\n` +
    (isPromo ? `🎟️ *Promo Applied:* Special Student Discount Active ✅\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *Total Amount:* *₹${totalAmount}*` +
    (totalSavings > 0 ? ` _(🎉 Saved ₹${totalSavings}!)_` : '') + `\n` +
    ((isPromo || isBulk) ? `⚡ _Applied ₹${ratePerPage}/p ${isPromo ? 'promo' : 'volume'} rate (${totalPrintedPages} total pages printed)_\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    (paymentLinkUrl ? `👉 *1-TAP PAYMENT LINK (UPI / GPay / PhonePe):*\n🔗 ${paymentLinkUrl}\n\n` : '') +
    `_Tap link above or button below to pay. Prints automatically once paid!_\n` +
    `_Code: ${pickupCode} · Valid for 30 minutes._`;

  const actionButtons = [];
  // 1-Tap UPI CTA button (Directly opens GPay / PhonePe / Paytm / UPI)
  if (paymentLinkUrl) {
    actionButtons.push({
      text: `💳 Pay ₹${totalAmount} via UPI`,
      url: paymentLinkUrl,
    });
  }

  // Only offer counter cash payment if explicitly allowed for this station (e.g. Romen Xerox)
  if (currentStation.allowCounterPayment) {
    actionButtons.push({
      id: 'btn_pay_cash',
      text: '💵 Pay Cash at Counter',
    });
  }
  actionButtons.push({
    id: 'btn_view_preview',
    text: '👁️ Preview Document',
  });
  actionButtons.push({
    id: 'btn_reset',
    text: '🔄 Change Settings',
  });

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title: '*PrintKurox* · Order Summary & Payment',
    body: summaryBody,
    footer: 'PrintKurox AutoPrint',
    buttons: actionButtons,
  });

  console.log(`[WA-Bot] Sent Order Summary & 1-Tap Payment Card to ${senderName || 'Student'} (Total: ₹${totalAmount})`);
}

// Backward-compatible wrappers
async function sendDocumentSummaryCard(sock, senderJid, session, senderName = 'Student') {
  return sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
}

async function sendDedicatedPaymentCard({ sock, senderJid, senderName = 'Student', session }) {
  return sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
}

/**
 * Send High-Resolution In-Chat Photo/Document Layout Preview
 * Replaces external web links with direct WhatsApp photo/image preview
 */
async function sendDocumentVisualPreview({ sock, senderJid, senderName = 'Student', session }) {
  if (!session) {
    await sendSessionExpiredMessage(sock, senderJid);
    return;
  }

  const activePagesCount = session.selectedPages ? session.selectedPages.length : session.totalPages;
  const orientLabel = session.orientation === 'landscape' ? 'Landscape (Wide)' : 'Portrait (Vertical)';
  const colorLabel = session.colorMode === 'color' ? '🎨 Color' : '⚫ Black & White';
  const totalAmount = session.totalPrice || 1;
  const totalCopies = session.copies || 1;

  // Immediate typing feedback
  sock.sendPresenceUpdate('composing', senderJid).catch(() => {});

  let previewBuffer = null;
  const inputBuffer = session.fileBuffer || session.imageBuffer;

  if (inputBuffer) {
    try {
      const prevResult = await generatePreviewImage({
        inputBuffer,
        fileName: session.fileName,
        colorMode: session.colorMode || 'bw',
        selectedPages: session.selectedPages,
      });
      if (prevResult && prevResult.buffer) {
        previewBuffer = prevResult.buffer;
      }
    } catch (prevErr) {
      console.warn('[WA-Bot] Preview generation warning:', prevErr.message);
    }
  }

  if (!previewBuffer && session.imageBuffer) {
    previewBuffer = session.imageBuffer;
  }

  if (previewBuffer) {
    const pagesNote = session.totalPages > 1
      ? `📑 *Pages:* ${session.pageRangeStr || 'All'} (${activePagesCount} of ${session.totalPages})\n`
      : `📑 *Pages:* 1 page\n`;

    const previewCaption =
      `📄 *Document Layout Preview:*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 *File:* ${session.fileName}\n` +
      `🖨️ *Print Mode:* ${colorLabel}\n` +
      `📐 *Orientation:* ${orientLabel} (Natural)\n` +
      `${pagesNote}` +
      `💰 *Total Amount:* *₹${totalAmount}* (${totalCopies} ${totalCopies === 1 ? 'copy' : 'copies'})\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      (session.paymentLinkUrl ? `👉 *1-Tap Payment Link:*\n🔗 ${session.paymentLinkUrl}\n\n` : '') +
      `_Tap button below or link above to pay!_`;

    const actionButtons = [];
    if (session.paymentLinkUrl) {
      actionButtons.push({
        text: `💳 Pay ₹${totalAmount} via UPI`,
        url: session.paymentLinkUrl,
      });
    }
    actionButtons.push({
      id: 'btn_reset',
      text: '🔄 Change Settings',
    });

    // 1. Send the rendered preview photo directly to WhatsApp
    await sock.sendMessage(senderJid, {
      image: previewBuffer,
      caption: previewCaption,
    });

    // 2. Send 1-tap interactive button card directly under the image
    if (actionButtons.length > 0) {
      await sendInteractiveButtons({
        sock,
        jid: senderJid,
        title: '💳 Print Authorization',
        body: `Ready to print? Complete payment below to start printing immediately at *${session.station?.name || defaultStation.name}*!`,
        footer: 'PrintKurox AutoPrint',
        buttons: actionButtons,
      });
    }
    console.log(`[WA-Bot] Dispatched photo preview directly to ${senderName} (${senderJid})`);
  } else {
    // Graceful fallback if buffer unavailable
    const previewUrl = `${PUBLIC_KIOSK_URL}/preview?key=${encodeURIComponent(session.fileKey)}&name=${encodeURIComponent(session.fileName)}&pages=${session.totalPages}&mode=${session.colorMode}`;
    await sock.sendMessage(senderJid, {
      text:
        `👁️ *Document Layout Preview:*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📄 *File:* ${session.fileName}\n` +
        `📑 *Pages:* ${session.pageRangeStr || 'All'} (${activePagesCount} of ${session.totalPages})\n` +
        `📐 *Orientation:* ${orientLabel} (Natural)\n` +
        `🖨️ *Print Mode:* ${colorLabel}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔍 *Tap to view preview online:*\n` +
        `${previewUrl}\n\n` +
        `_Tap "Pay via UPI" above to print!_`,
    });
  }
}

/**
 * Monitor a pending Razorpay Payment Link every 3 seconds for 10 minutes
 */
function monitorPaymentLink({ sock, senderJid, paymentLinkId, jobId, pickupCode, fileName }) {
  if (!razorpay || !paymentLinkId) return;

  if (activePollers.has(jobId)) {
    clearInterval(activePollers.get(jobId));
    activePollers.delete(jobId);
  }

  const startTime = Date.now();
  const maxDurationMs = 10 * 60 * 1000;

  const interval = setInterval(async () => {
    try {
      const session = userSessions.get(senderJid);
      if (!session || session.jobId !== jobId || session.stage === 'COMPLETED') {
        clearInterval(interval);
        activePollers.delete(jobId);
        return;
      }

      if (Date.now() - startTime > maxDurationMs) {
        clearInterval(interval);
        activePollers.delete(jobId);
        return;
      }

      const linkData = await razorpay.paymentLink.fetch(paymentLinkId);
      if (linkData && linkData.status === 'paid') {
        clearInterval(interval);
        activePollers.delete(jobId);
        session.stage = 'COMPLETED';

        const paymentId = linkData.payments?.[0]?.payment_id || `pay_${Date.now().toString().slice(-6)}`;
        const currentStation = session.station || defaultStation;

        await executeD1(
          `UPDATE print_jobs SET status = 'PAID', payment_id = ? WHERE id = ?`,
          [paymentId, jobId]
        );

        fetch('http://127.0.0.1:7250/poll-now', { signal: AbortSignal.timeout(300) }).catch(() => {});

        const confirmBody =
          `✅ *Payment Verified* (₹${session.totalPrice || 0} via UPI)\n\n` +
          `🔑 *PICKUP CODE:*\n` +
          `👉  *【 ${pickupCode} 】*\n\n` +
          `📄 *Document:* ${fileName}\n` +
          `📍 *Location:* ${currentStation.name} (${currentStation.room})\n` +
          `⚡ *Status:* Queued for immediate automated print\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `*Pickup Steps:*\n` +
          `1. Walk to the kiosk terminal at ${currentStation.room}.\n` +
          `2. Enter code *${pickupCode}* on the touch screen.\n` +
          `3. Your pages will print automatically.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 *Campus Services on this Bot:*\n` +
          `• 🎓 Classmate Directory: reply \`@student <name>\` (e.g. \`@student dev\`)\n` +
          `• 👨‍🏫 Faculty Contacts: reply \`@find <faculty>\` (e.g. \`@find devachandra\`)\n` +
          `• 🤖 Campus AI: Ask any question directly to chat with Agent Kurox!\n\n` +
          `_Need help? Call operator: +91 ${STATION_CONTACT}_`;

        await sendInteractiveButtons({
          sock: activeBotSock || sock,
          jid: senderJid,
          title: 'PrintKurox · Payment Confirmed',
          body: confirmBody,
          footer: 'PrintKurox & NERIST Student Directory',
          buttons: [
            { id: 'btn_flow_student', text: '🎓 Search Student Directory' },
            { id: 'btn_flow_printing', text: '🖨️ Print Another Document' },
          ],
        });
        console.log(`[WA-Bot] Payment detected for ${jobId} (${pickupCode}), confirmed to ${senderJid}`);
      }
    } catch (pollErr) {}
  }, 3000);

  activePollers.set(jobId, interval);
}

/**
 * Handle Cash Order Confirmation
 */
async function handleCashOrder({ sock, senderJid, session }) {
  if (!session || !session.jobId) {
    await sock.sendMessage(senderJid, {
      text: `ℹ️ No active document found. Please forward your PDF or photo first!`,
    });
    return;
  }

  const currentStation = session.station || defaultStation;

  // Enforce station policy: autonomous hostel kiosks do NOT allow counter cash
  if (!currentStation.allowCounterPayment) {
    const payLinkText = session.paymentLinkUrl ? `\n\n🔗 *Direct UPI Payment Link:*\n${session.paymentLinkUrl}` : '';
    await sock.sendMessage(senderJid, {
      text:
        `*PrintKurox AutoPrint*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `ℹ️ *Counter cash payment is not available at ${currentStation.name}*.\n\n` +
        `This is a 24/7 autonomous self-service kiosk with no cashier desk.\n` +
        `Please pay *₹${session.totalPrice || 0}* via the 1-Tap UPI button above to trigger instant automated printing!${payLinkText}`,
    });
    return;
  }

  if (session.uploadPromise) {
    try {
      await session.uploadPromise;
    } catch (upErr) {
      console.warn('[WA-Bot] Upload promise wait notice in cash order:', upErr.message);
    }
  }

  session.stage = 'COMPLETED';

  fetch('http://127.0.0.1:7250/poll-now', { signal: AbortSignal.timeout(300) }).catch(() => {});

  const cashBody =
    `🔑 *PICKUP CODE:*\n` +
    `👉  *【 ${session.pickupCode} 】*\n\n` +
    `📄 *Document:* ${session.fileName}\n` +
    `💰 *Amount Due:* *₹${session.totalPrice} (Cash)*\n` +
    `📍 *Counter:* ${currentStation.name} (${currentStation.room})\n` +
    `⏳ *Status:* Awaiting counter payment\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `*Pickup Steps:*\n` +
    `1. Go to ${currentStation.room} operator desk.\n` +
    `2. Pay *₹${session.totalPrice}* cash and quote code *${session.pickupCode}*.\n` +
    `3. Your document will print instantly.\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Campus Services on this Bot:*\n` +
    `• 🎓 Classmate Directory: reply \`@student <name>\` (e.g. \`@student dev\`)\n` +
    `• 👨‍🏫 Faculty Contacts: reply \`@find <faculty>\` (e.g. \`@find devachandra\`)\n` +
    `• 🤖 Campus AI: Ask any question directly to chat with Agent Kurox!`;

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title: 'PrintKurox · Cash Order Registered',
    body: cashBody,
    footer: 'PrintKurox & NERIST Student Directory',
    buttons: [
      { id: 'btn_flow_student', text: '🎓 Search Student Directory' },
      { id: 'btn_flow_printing', text: '🖨️ Print Another Document' },
    ],
  });
  console.log(`[WA-Bot] Cash order confirmed for ${session.pickupCode} (${senderJid})`);
}

function getExifOrientation(buffer) {
  try {
    if (!buffer || buffer.length < 14) return 1;
    if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return 1;
    let offset = 2;
    while (offset < buffer.length - 4) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      const len = buffer.readUInt16BE(offset + 2);
      if (marker === 0xE1) {
        if (buffer.slice(offset + 4, offset + 10).toString('latin1') === 'Exif\0\0') {
          const tiffStart = offset + 10;
          const isLittle = buffer.slice(tiffStart, tiffStart + 2).toString('latin1') === 'II';
          const read16 = (o) => isLittle ? buffer.readUInt16LE(o) : buffer.readUInt16BE(o);
          const read32 = (o) => isLittle ? buffer.readUInt32LE(o) : buffer.readUInt32BE(o);
          const firstIfdOffset = read32(tiffStart + 4);
          const ifdStart = tiffStart + firstIfdOffset;
          const numEntries = read16(ifdStart);
          for (let i = 0; i < numEntries; i++) {
            const entryStart = ifdStart + 2 + i * 12;
            if (entryStart + 12 > buffer.length) break;
            const tag = read16(entryStart);
            if (tag === 0x0112) {
              return read16(entryStart + 8);
            }
          }
        }
        break;
      }
      offset += 2 + len;
    }
  } catch (e) {}
  return 1;
}

/**
 * Fast binary header inspection to detect if image is truly Landscape.
 * Documents photographed sideways on WhatsApp default to Portrait on A4.
 */
function detectImageLandscape(buffer) {
  try {
    if (!buffer) return false;
    let w = 0, h = 0;
    // PNG inspection: IHDR width at offset 16, height at offset 20
    if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
      w = buffer.readUInt32BE(16);
      h = buffer.readUInt32BE(20);
    }
    // JPEG inspection: SOF0/SOF2 marker
    else if (buffer.length > 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
      for (let i = 2; i < buffer.length - 8; i++) {
        if (buffer[i] === 0xFF && (buffer[i + 1] === 0xC0 || buffer[i + 1] === 0xC2)) {
          h = buffer.readUInt16BE(i + 5);
          w = buffer.readUInt16BE(i + 7);
          break;
        }
      }
      const exifOrient = getExifOrientation(buffer);
      if (exifOrient === 6 || exifOrient === 8) {
        const temp = w;
        w = h;
        h = temp;
      }
    }
    if (w > 0 && h > 0) {
      // Standard camera ratios (4:3 = 1.33, 16:9 = 1.77) for documents are printed on Portrait A4.
      // Only set true landscape if extreme panorama (w > h * 2.0).
      return w > h * 2.0;
    }
  } catch (e) {}
  return false;
}

/**
 * Dispatch Staging Queue Card (Allows students to add more files or continue)
 */
async function sendQueueStagingCard({ sock, senderJid, session, justAddedFileNames = [] }) {
  if (!session || !session.queuedFiles || session.queuedFiles.length === 0) return;

  const count = session.queuedFiles.length;
  const totalPages = session.queuedFiles.reduce((acc, f) => acc + (f.pages || 1), 0);
  const totalSizeMb = session.queuedFiles.reduce((acc, f) => acc + parseFloat(f.sizeMb || 0), 0).toFixed(2);
  const currentStation = session.station || defaultStation;

  // Build the list of files (display all queued items cleanly up to 12)
  let fileListLines = '';
  const maxDisplay = 12;
  const displayFiles = session.queuedFiles.slice(0, maxDisplay);
  displayFiles.forEach((f, idx) => {
    const pStr = f.pages === 1 ? '1 page' : `${f.pages} pages`;
    fileListLines += `${idx + 1}. *${f.fileName.slice(0, 28)}* (${pStr}, ${f.sizeMb} MB)\n`;
  });
  if (count > maxDisplay) {
    fileListLines += `... and *${count - maxDisplay} more* document(s)\n`;
  }

  const addedNotice = justAddedFileNames.length > 0
    ? `📥 *File Added:* ${justAddedFileNames.map(n => `"${n.slice(0, 24)}"`).join(', ')}\n\n`
    : '';

  const title = `*PrintKurox* · Print Queue (${count} ${count === 1 ? 'File' : 'Files'})`;
  const isBulk = totalPages >= 10;
  const isPromo = !!session.promoApplied;

  let tariffNotice = '';
  if (isPromo) {
    tariffNotice = isBulk
      ? `🎉 *Promo Bulk Tariff Active!* B&W ₹2.50/p · Color ₹4/p\n`
      : `🎟️ *Promo Discount Active!* B&W ₹3/p · Color ₹5/p (10+ pgs: B&W ₹2.50/p)\n`;
  } else if (isBulk) {
    tariffNotice = `🎉 *Special Offer Unlocked (10+ pages)!* B&W ₹3/p · Color ₹5/p (Single page only)\n`;
  } else {
    tariffNotice = `💡 *Tip:* Add ${10 - totalPages} more page(s) to unlock B&W ₹3/p & Color ₹5/p!\n`;
  }

  let multiFileNotice = '';
  if (count >= 2) {
    multiFileNotice =
      `\n💡 *Multi-File Upload Notice:*\n` +
      `Receiving multiple files is limited due to WhatsApp policy.\n` +
      `• Files with a reaction emoji (📄/🖼️) are safely added to your queue.\n` +
      `• If any file is missing, please resend the file that does not have a reaction emoji, or send your pages merged inside a single PDF.\n`;
  }

  const body =
    `${addedNotice}` +
    `📚 *Current Print Queue:*\n` +
    `${fileListLines}` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Total:* *${totalPages}* ${totalPages === 1 ? 'page' : 'pages'} (${totalSizeMb} MB)\n` +
    tariffNotice +
    `📍 *Station:* ${currentStation.name} (${currentStation.room})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    multiFileNotice +
    `*Ready to print, or do you have more files to add?*\n` +
    `_Reply *proceed* to continue, *add* for more files, or *cancel* to quit._`;

  const buttons = [
    { id: 'btn_queue_continue', text: `✅ Proceed to Print (${count} ${count === 1 ? 'File' : 'Files'})` },
    { id: 'btn_queue_rescan', text: '🔄 Rescan Recent Files' },
    { id: 'btn_queue_clear', text: '❌ Cancel Print' },
  ];

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title,
    body,
    footer: 'PrintKurox AutoPrint · Multi-File Queue',
    buttons,
  });
}

/**
 * Dispatch Change Settings & Promo Card
 * Displayed when user taps "Change Settings" on the payment card.
 * Preserves colorMode, copies, and page settings, offering promo code input or instant checkout.
 */
async function sendChangeSettingsCard({ sock, senderJid, session }) {
  if (!session) return;
  const fileName = session.fileName || session.queuedFiles?.[0]?.fileName || 'Document';
  const colorModeStr = session.colorMode === 'color' ? '🎨 Color' : '⚫ Black & White';
  const copiesStr = session.copies ? `${session.copies} ${session.copies === 1 ? 'copy' : 'copies'}` : '1 copy';
  const pagesStr = session.pageRangeStr || 'All';
  const currentStation = session.station || defaultStation;

  const title = '*PrintKurox* · Settings & Promo';
  const promoStatusStr = session.promoApplied
    ? `🎟️ *Promo Status:* Applied ✅ (B&W ₹3.00/p, Color ₹5.00/p [<10 pgs] · B&W ₹2.50/p, Color ₹4.00/p [10+ pgs])\n`
    : `🎟️ *Promo Status:* Standard Tariffs Active\n`;

  const body =
    `⚙️ *Preserved Print Settings:*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📄 *File:* ${fileName}\n` +
    `🖨️ *Mode:* ${colorModeStr}\n` +
    `🔢 *Copies:* ${copiesStr}\n` +
    `📑 *Pages:* ${pagesStr}\n` +
    `📍 *Station:* ${currentStation.name} (${currentStation.room})\n` +
    `${promoStatusStr}` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `*Choose an action below:*\n` +
    `• Tap *Proceed to Print* to continue to checkout\n` +
    `• Tap *Apply Promo Code* to enter promo code\n` +
    `• Or reply *color*, *bw*, or copies number (e.g. *2*) to change\n` +
    `• Reply *cancel* to quit`;

  const promoBtnText = session.promoApplied ? '🎟️ Promo Applied ✅' : '🎟️ Apply Promo Code';
  const buttons = [
    { id: 'btn_proceed_payment', text: '✅ Proceed to Print' },
    { id: 'btn_queue_promo', text: promoBtnText },
    { id: 'btn_queue_clear', text: '❌ Cancel Print' },
  ];

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title,
    body,
    footer: 'PrintKurox AutoPrint · Settings & Discounts',
    buttons,
  });
}

/**
 * Rescans recent chat media attachments from the last 5 minutes.
 * Recovers any missed/delayed files without creating duplicates.
 */
async function handleRescanRecentFiles({ sock, senderJid, normalizedJid, session, senderName = 'Student' }) {
  if (!session) {
    session = {
      stage: 'QUEUE_STAGING',
      senderJid,
      senderName,
      station: defaultStation,
      timestamp: Date.now(),
      queuedFiles: [],
    };
    userSessions.set(senderJid, session);
    userSessions.set(normalizedJid, session);
  }

  const now = Date.now();
  const cancelledAt = cancelledTimestamps.get(normalizedJid) || 0;
  const mediaHistory = recentChatMedia.get(normalizedJid) || [];
  const validRecent = mediaHistory.filter(item => (now - item.timestamp) < RESCAN_WINDOW_MS && item.timestamp > cancelledAt);

  // Identify media messages not already in session.queuedFiles
  const existingMsgIds = new Set((session.queuedFiles || []).map(f => f.msgId).filter(Boolean));
  const missingItems = validRecent.filter(item => !existingMsgIds.has(item.msgId));

  if (missingItems.length === 0) {
    const count = (session.queuedFiles || []).length;
    const totalPages = (session.queuedFiles || []).reduce((acc, f) => acc + (f.pages || 1), 0);
    await sock.sendMessage(senderJid, {
      text:
        `✅ *Queue Verified (${count} ${count === 1 ? 'File' : 'Files'})*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `All files delivered by WhatsApp in the last 5 minutes are currently in your queue (${totalPages} ${totalPages === 1 ? 'page' : 'pages'} total).\n\n` +
        `📌 *Sent more files that didn't appear?*\n` +
        `Receiving multiple files is limited due to WhatsApp policy.\n` +
        `• Look at your messages above: resend any file that lacks a reaction emoji (📄/🖼️).\n` +
        `• Or send your pages merged inside a single PDF for guaranteed 100% receipt.\n\n` +
        `_Tap Proceed to Print when ready!_`,
    });
    await sendQueueStagingCard({ sock, senderJid, session });
    return;
  }

  await sock.sendMessage(senderJid, {
    text: `🔄 *Rescanning Recent Files...*\nChecking ${missingItems.length} recent chat attachment(s) for missing files...`,
  });

  const recoveredNames = [];
  for (const item of missingItems) {
    const { mediaObj, mediaType, rawMsg, fileName, mimeType, msgId, msgKey } = item;

    // Strict duplicate check before downloading
    if (session.queuedFiles.some(f => f.msgId === msgId)) continue;

    if (msgKey) {
      sock.sendMessage(senderJid, { react: { text: '⏳', key: msgKey } }).catch(() => {});
    }

    let buffer = null;
    try {
      buffer = await downloadMediaWithRetry(mediaObj, mediaType, rawMsg, sock, 2);
    } catch (e) {
      console.warn(`[Rescan] Download failed for ${fileName}:`, e.message);
    }

    if (!buffer || buffer.length === 0) {
      if (msgKey) {
        sock.sendMessage(senderJid, { react: { text: '❌', key: msgKey } }).catch(() => {});
      }
      continue;
    }

    let pages = 1;
    let isLandscape = false;
    const isPdfItem = (buffer.length >= 4 && buffer.slice(0, 4).toString() === '%PDF') || (fileName && fileName.toLowerCase().endsWith('.pdf')) || (mimeType && mimeType.includes('pdf'));
    if (isPdfItem) {
      try {
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        pdfDoc.isEncrypted = false;
        pages = pdfDoc.getPageCount();
        const firstPage = pdfDoc.getPages()[0];
        if (firstPage) {
          const { width, height } = firstPage.getSize();
          isLandscape = width > height;
        }
      } catch (err) {
        pages = 1;
      }
    } else {
      pages = 1;
      isLandscape = detectImageLandscape(buffer);
    }

    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Strict deduplication check: Prevent duplicate files using msgId or buffer sha256 hash
    const duplicateExists = session.queuedFiles.some(f =>
      (msgId && f.msgId === msgId) ||
      (f.hash && f.hash === fileHash)
    );

    if (!duplicateExists) {
      session.queuedFiles.push({
        msgId,
        fileName,
        buffer,
        mimeType,
        pages,
        isLandscape,
        sizeMb,
        hash: fileHash,
        isPdf: isPdfItem,
        isImg: !isPdfItem,
      });
      recoveredNames.push(fileName);
      item.status = 'downloaded';

      if (msgKey) {
        sock.sendMessage(senderJid, { react: { text: isPdfItem ? '📄' : '🖼️', key: msgKey } }).catch(() => {});
      }
    }
  }

  if (recoveredNames.length > 0) {
    await sock.sendMessage(senderJid, {
      text:
        `✅ *Recovered ${recoveredNames.length} Missed File(s)!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Added:\n` +
        recoveredNames.map((n) => `• 📄 _${n}_`).join('\n') +
        `\n\nTotal in print queue: *${session.queuedFiles.length} file(s)*.`,
    });
  } else if (missingItems.length > 0) {
    await sock.sendMessage(senderJid, {
      text:
        `⚠️ *Could Not Recover Attachments*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Checked ${missingItems.length} recent attachment(s), but their media files could not be retrieved from WhatsApp servers (media expired or connection timed out).\n\n` +
        `Please resend those photos or documents directly to this chat!`,
    });
  }

  session.timestamp = Date.now();
  session.stage = 'QUEUE_STAGING';
  await sendQueueStagingCard({
    sock,
    senderJid,
    session,
    justAddedFileNames: recoveredNames,
  });
}

/**
 * Action Helper: Generate Official Application PDF from active draft
 */
async function handleGenerateApplicationPdfAction({ sock, senderJid, normalizedJid, senderName }) {
  const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
  const draft = (norm && activeDrafts.get(norm)) || (senderJid && activeDrafts.get(senderJid));
  if (!draft || !draft.text) {
    await sock.sendMessage(senderJid, {
      text: `⚠️ *No active application draft found!*\n\nSimply tell me what application you'd like to write (e.g., _"Write hostel leave application for 3 days"_), and I'll create a fresh draft for your review.`
    });
    return;
  }

  sock.sendPresenceUpdate('composing', senderJid).catch(() => {});
  try {
    const studentNameClean = (draft.studentName && draft.studentName !== 'NERIST Student') ? draft.studentName : ((senderName && /^[a-zA-Z\s]{2,30}$/.test(senderName.trim())) ? senderName.trim() : 'NERIST Student');
    const pdfBuffer = await generateApplicationPdf({
      draftText: draft.text,
      studentName: studentNameClean,
      rollNo: draft.rollNo || '',
      stationName: STATION_NAME
    });

    const fileSuffix = Date.now().toString().slice(-4);
    const fileName = `NERIST_Application_${fileSuffix}.pdf`;

    // Deliver the compiled vector PDF document (no kiosk print upsell button)
    await sock.sendMessage(senderJid, {
      document: pdfBuffer,
      mimetype: 'application/pdf',
      fileName,
      caption: `📄 *Official Academic Application PDF Generated!*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Formatted to institutional standards with header & signature block.\n📥 Download the PDF above to submit or print!`
    });
  } catch (err) {
    console.error('[WA-Bot] ❌ Error in handleGenerateApplicationPdfAction:', err);
    await sock.sendMessage(senderJid, {
      text: `❌ *Error generating PDF:*\n${err.message}\nPlease try again or copy the draft text above.`
    });
  }
}

/**
 * Action Helper: Generate Editable Microsoft Word (.docx) Application from active draft
 */
async function handleGenerateApplicationDocxAction({ sock, senderJid, normalizedJid, senderName }) {
  const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
  const draft = (norm && activeDrafts.get(norm)) || (senderJid && activeDrafts.get(senderJid));
  if (!draft || !draft.text) {
    await sock.sendMessage(senderJid, {
      text: `⚠️ *No active application draft found!*\n\nSimply tell me what application you'd like to write (e.g., _"Write hostel leave application for 3 days"_), and I'll create a fresh draft for your review.`
    });
    return;
  }

  sock.sendPresenceUpdate('composing', senderJid).catch(() => {});
  try {
    const studentNameClean = (draft.studentName && draft.studentName !== 'NERIST Student') ? draft.studentName : ((senderName && /^[a-zA-Z\s]{2,30}$/.test(senderName.trim())) ? senderName.trim() : 'NERIST Student');
    const docxBuffer = await generateApplicationDocx({
      draftText: draft.text,
      studentName: studentNameClean,
      rollNo: draft.rollNo || '',
    });

    const fileSuffix = Date.now().toString().slice(-4);
    const fileName = `NERIST_Application_${fileSuffix}.docx`;

    // Deliver the compiled Word document
    await sock.sendMessage(senderJid, {
      document: docxBuffer,
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName,
      caption: `📝 *Official Application Word Document (.docx) Generated!*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Formatted to institutional standards.\n📥 Tap above to download and edit in Microsoft Word, Google Docs, or WPS Office!`
    });
  } catch (err) {
    console.error('[WA-Bot] ❌ Error in handleGenerateApplicationDocxAction:', err);
    await sock.sendMessage(senderJid, {
      text: `❌ *Error generating Word document:*\n${err.message}\nPlease try again or copy the draft text above.`
    });
  }
}

/**
 * Action Helper: Generate Official Assignment Front Cover PDF
 */
async function handleGenerateAssignmentCoverPdfAction({ sock, senderJid, normalizedJid, senderName }) {
  const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
  const userPhone = await resolveUserPhone(sock, senderJid);
  const cover = (typeof getCoverDraft === 'function' ? getCoverDraft(senderJid, norm, userPhone) : null) ||
                (norm && activeCoverDrafts.get(norm)) ||
                (senderJid && activeCoverDrafts.get(senderJid));
  if (!cover) {
    await sock.sendMessage(senderJid, {
      text: `⚠️ *No active assignment cover details found!*\n\nSimply tell me your assignment details (e.g., _"Generate cover for CE24016 Structural Dynamics to Dr. Tori Basar"_ or _"add Richard Konsam details"_), and I'll create your official cover page immediately!`
    });
    return;
  }

  sock.sendPresenceUpdate('composing', senderJid).catch(() => {});
  try {
    const studentNameClean = (cover.studentName && cover.studentName !== 'NERIST Student') ? cover.studentName : ((senderName && /^[a-zA-Z\s]{2,30}$/.test(senderName.trim())) ? senderName.trim() : 'NERIST Student');
    const pdfBuffer = await generateAssignmentCoverPdf({
      subjectName: cover.subjectName || 'STRUCTURAL DYNAMICS',
      subjectCode: cover.subjectCode || 'CE24016',
      assignmentTitle: cover.assignmentTitle || 'ASSIGNMENT',
      studentName: studentNameClean,
      rollNo: cover.rollNo || '',
      registrationNumber: cover.registrationNumber || cover.regNo || '',
      department: cover.department || '',
      yearSemester: cover.yearSemester || '',
      isCinderacVerified: Boolean(cover.isCinderacVerified),
      teacherName: cover.teacherName || 'DR. TORI BASAR',
      teacherDesignation: cover.teacherDesignation || 'Assistant Professor',
    });

    const fileSuffix = Date.now().toString().slice(-4);
    const fileName = `NERIST_Cover_${(cover.subjectCode || 'Assignment').replace(/\s+/g, '_')}_${fileSuffix}.pdf`;

    await sock.sendMessage(senderJid, {
      document: pdfBuffer,
      mimetype: 'application/pdf',
      fileName,
      caption: `📄 *Official NERIST Assignment Front Cover (PDF) Generated!*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Formatted to official standard with academic single border & red NERIST crest.\n📥 Tap to download and print!`
    });
  } catch (err) {
    console.error('[WA-Bot] ❌ Error in handleGenerateAssignmentCoverPdfAction:', err);
    await sock.sendMessage(senderJid, {
      text: `❌ *Error generating Cover PDF:*\n${err.message}\nPlease try again.`
    });
  }
}

/**
 * Action Helper: Generate Official Assignment Front Cover Word DOCX
 */
async function handleGenerateAssignmentCoverDocxAction({ sock, senderJid, normalizedJid, senderName }) {
  const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
  const userPhone = await resolveUserPhone(sock, senderJid);
  const cover = (typeof getCoverDraft === 'function' ? getCoverDraft(senderJid, norm, userPhone) : null) ||
                (norm && activeCoverDrafts.get(norm)) ||
                (senderJid && activeCoverDrafts.get(senderJid));
  if (!cover) {
    await sock.sendMessage(senderJid, {
      text: `⚠️ *No active assignment cover details found!*\n\nSimply tell me your assignment details (e.g., _"Generate cover for CE24016 Structural Dynamics to Dr. Tori Basar"_ or _"add Richard Konsam details"_), and I'll create your official cover page immediately!`
    });
    return;
  }

  sock.sendPresenceUpdate('composing', senderJid).catch(() => {});
  try {
    const studentNameClean = (cover.studentName && cover.studentName !== 'NERIST Student') ? cover.studentName : ((senderName && /^[a-zA-Z\s]{2,30}$/.test(senderName.trim())) ? senderName.trim() : 'NERIST Student');
    const docxBuffer = await generateAssignmentCoverDocx({
      subjectName: cover.subjectName || 'STRUCTURAL DYNAMICS',
      subjectCode: cover.subjectCode || 'CE24016',
      assignmentTitle: cover.assignmentTitle || 'ASSIGNMENT',
      studentName: studentNameClean,
      rollNo: cover.rollNo || '',
      registrationNumber: cover.registrationNumber || cover.regNo || '',
      department: cover.department || '',
      yearSemester: cover.yearSemester || '',
      isCinderacVerified: Boolean(cover.isCinderacVerified),
      teacherName: cover.teacherName || 'DR. TORI BASAR',
      teacherDesignation: cover.teacherDesignation || 'Assistant Professor',
    });

    const fileSuffix = Date.now().toString().slice(-4);
    const fileName = `NERIST_Cover_${(cover.subjectCode || 'Assignment').replace(/\s+/g, '_')}_${fileSuffix}.docx`;

    await sock.sendMessage(senderJid, {
      document: docxBuffer,
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName,
      caption: `📝 *Official NERIST Assignment Front Cover (.docx) Generated!*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Formatted to official standard with academic single border & embedded crest.\n📥 Tap to open and edit in Microsoft Word, Google Docs, or WPS Office!`
    });
  } catch (err) {
    console.error('[WA-Bot] ❌ Error in handleGenerateAssignmentCoverDocxAction:', err);
    await sock.sendMessage(senderJid, {
      text: `❌ *Error generating Cover Word document:*\n${err.message}\nPlease try again.`
    });
  }
}

/**
 * Action Helper: Generate 1-Click Assignment Front Cover from Synced Cinderac Course
 */
async function handleGenerateCinderacCoverAction({ sock, senderJid, normalizedJid, senderName, userPhone, courseIndex = 0 }) {
  const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
  const session = getCinderacSession(senderJid, userPhone);
  if (!session || !session.courses || session.courses.length === 0) {
    await sock.sendMessage(senderJid, {
      text: '⚠️ *No registered courses found!*\nPlease link your Cinderac portal first by replying:\n`login <RegId> <Password>`\n\n💡 _Example:_\n`login 121/016 Password123`'
    });
    return;
  }

  const selectedCourse = session.courses[courseIndex] || session.courses[0];
  const prof = session.profile || {};

  // Resolve faculty designation from faculty.json
  let teacherTitle = selectedCourse.faculty;
  let teacherDesig = 'Assistant Professor';
  try {
    const rawFac = JSON.parse(fs.readFileSync(path.join(__dirname, 'faculty.json'), 'utf8'));
    const facClean = selectedCourse.faculty.toLowerCase().trim();
    const facMatch = rawFac.find(f => {
      const fn = (f.name || '').toLowerCase();
      return fn.includes(facClean) || facClean.includes(fn);
    });
    if (facMatch) {
      if (facMatch.name && !teacherTitle.toUpperCase().startsWith('DR.') && /dr\b/i.test(facMatch.name)) {
        teacherTitle = `DR. ${selectedCourse.faculty}`;
      }
      if (facMatch.designation) {
        teacherDesig = facMatch.designation;
      }
    }
  } catch (e) {}

  const coverObj = {
    subjectName: selectedCourse.name,
    subjectCode: selectedCourse.code,
    assignmentTitle: 'ASSIGNMENT',
    studentName: prof.fullName || senderName || 'NERIST Student',
    rollNo: prof.rollNo || '',
    registrationNumber: prof.regId || '',
    department: prof.departmentName || 'ELECTRONICS AND COMMUNICATION ENGINEERING',
    yearSemester: prof.semester ? `B.Tech Semester ${prof.semester}` : '',
    isCinderacVerified: true,
    teacherName: teacherTitle,
    teacherDesignation: teacherDesig,
    academicSession: '2026-2027 Jul-Dec',
    timestamp: Date.now()
  };

  saveCoverDraft(senderJid, norm, userPhone, coverObj);

  await sock.sendMessage(senderJid, {
    text:
      `📄 *Generating Official Assignment Cover (Cinderac 1-Click)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Subject:* ${coverObj.subjectCode}  ${coverObj.subjectName}\n` +
      `• *Faculty:* ${coverObj.teacherName} (${coverObj.teacherDesignation})\n` +
      `• *Student:* ${coverObj.studentName}\n` +
      `• *Roll No:* ${coverObj.rollNo}\n` +
      `• *Registration No:* ${coverObj.registrationNumber}\n` +
      `• *Department:* ${coverObj.department}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ Compiling official PDF and Word document...`
  });

  await handleGenerateAssignmentCoverPdfAction({ sock, senderJid, normalizedJid: norm, senderName });
  await handleGenerateAssignmentCoverDocxAction({ sock, senderJid, normalizedJid: norm, senderName });

  userLastOpenedStudio.set(senderJid, 'cinderac_cover');
  if (norm) userLastOpenedStudio.set(norm, 'cinderac_cover');

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title: '🖨️ Document Ready for Printing',
    body:
      `Your official assignment front cover for *${coverObj.subjectCode}* has been compiled successfully!\n\n` +
      `• Student: *${coverObj.studentName}*\n` +
      `• Roll No: *${coverObj.rollNo}* · Reg: *${coverObj.registrationNumber}*\n` +
      `• Faculty: *${coverObj.teacherName}*\n\n` +
      `Choose an action below:`,
    footer: 'Agent Kurox · Campus Printing Kiosk',
    buttons: [
      { id: 'btn_print_generated_doc', text: '🖨️ 1-Tap Print' },
      { id: 'btn_flow_cover', text: '📚 Pick Another Course' },
      { id: 'btn_cover_edit', text: '✏️ Edit Details' }
    ]
  });
}

/**
 * Action Helper: 1-Tap Load Generated Document into Print Queue
 */
async function handlePrintGeneratedDocAction({ sock, senderJid, normalizedJid, senderName }) {
  const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
  const readyDoc = (norm && readyToPrintDocs.get(norm)) || (senderJid && readyToPrintDocs.get(senderJid));
  if (!readyDoc || !readyDoc.buffer) {
    await sock.sendMessage(senderJid, {
      text: `⚠️ *No ready document found to print!*\n\nPlease ask me to draft an application first or forward any PDF/photo you want to print.`
    });
    return;
  }

  // Clear previous print session
  purgeUserPrintSession(senderJid, norm);

  // Initialize fresh print session with the generated PDF
  const session = {
    stage: 'QUEUE_STAGING',
    senderJid,
    normalizedJid: norm,
    senderName: readyDoc.senderName || senderName,
    timestamp: Date.now(),
    station: defaultStation,
    queuedFiles: [{
      fileName: readyDoc.fileName || 'NERIST_Application.pdf',
      buffer: readyDoc.buffer,
      isPdf: true,
      pages: 1,
      mimeType: 'application/pdf',
      orientation: 'portrait',
      receivedAt: Date.now()
    }]
  };
  if (senderJid) userSessions.set(senderJid, session);
  if (norm) userSessions.set(norm, session);

  await sock.sendMessage(senderJid, {
    text: `⚡ *Loading Application into Print Queue!*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nRouting *${readyDoc.fileName}* to ${STATION_NAME} kiosk...`
  });

  await continueWithQueuedFiles({ sock, senderJid, session, senderName: readyDoc.senderName || senderName });
}

/**
 * Action Helper: Generate Interactive HTML Game or Web Page
 */
async function handleGenerateHtmlGameAction({ sock, senderJid, normalizedJid, senderName }) {
  const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
  const draft = (norm && activeGameDrafts.get(norm)) || (senderJid && activeGameDrafts.get(senderJid));
  const gameType = draft?.gameType || 'snake';

  sock.sendPresenceUpdate('composing', senderJid).catch(() => {});
  try {
    let htmlStr = draft?.htmlContent;
    if (!htmlStr) {
      htmlStr = generateHtmlGame(gameType, { studentName: senderName });
    }
    const htmlBuffer = Buffer.from(htmlStr, 'utf-8');
    const fileName = `${gameType}_nerist.html`;

    await sock.sendMessage(senderJid, {
      document: htmlBuffer,
      mimetype: 'text/html',
      fileName,
      caption: `🎮 *Interactive HTML File Generated!*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🕹️ *Title:* ${gameType.toUpperCase()}\n📱 Tap the file above to open directly in your mobile browser (Chrome/Safari)!\n\n_100% offline — runs without internet._`
    });
  } catch (err) {
    console.error('[WA-Bot] ❌ Error in handleGenerateHtmlGameAction:', err);
    await sock.sendMessage(senderJid, {
      text: `❌ *Error generating HTML file:*\n${err.message}`
    });
  }
}

/**
 * Finalize Queued Files: Merge if multi-file, upload to Cloudflare R2, and dispatch Step 1 (Color Selection)
 */
async function continueWithQueuedFiles({ sock, senderJid, session, senderName = 'Student' }) {
  if (!session || !session.queuedFiles || session.queuedFiles.length === 0) {
    await sock.sendMessage(senderJid, {
      text: `ℹ️ Your print queue is empty. Please attach or forward a PDF or photo first!`,
    });
    return;
  }

  const files = session.queuedFiles;
  let finalBuffer = null;
  let finalFileName = '';
  let finalMimeType = 'application/pdf';
  let totalPages = 1;
  let isLandscapeDefault = false;
  let isMergedBatch = false;

  sock.sendPresenceUpdate('composing', senderJid).catch(() => {});

  if (files.length === 1) {
    const f = files[0];
    const isImg = f.isImg || (f.mimeType && f.mimeType.startsWith('image/')) || (f.fileName && /\.(jpe?g|png|webp|bmp)$/i.test(f.fileName));
    if (isImg) {
      try {
        const singlePdf = await PDFDocument.create();
        let embeddedImage;
        const isPng = f.buffer.length > 24 && f.buffer[0] === 0x89 && f.buffer[1] === 0x50;
        if (isPng) {
          try { embeddedImage = await singlePdf.embedPng(f.buffer); }
          catch (e) { embeddedImage = await singlePdf.embedJpg(f.buffer); }
        } else {
          try { embeddedImage = await singlePdf.embedJpg(f.buffer); }
          catch (e) { embeddedImage = await singlePdf.embedPng(f.buffer); }
        }

        if (embeddedImage) {
          const a4W = 595.28;
          const a4H = 841.89;
          const page = singlePdf.addPage([a4W, a4H]);
          const margin = 24;
          const maxW = a4W - (margin * 2);
          const maxH = a4H - (margin * 2);

          if (embeddedImage.width > embeddedImage.height) {
            // Auto-rotate sideways document 90° CCW so it is upright on Portrait A4
            const targetW = embeddedImage.height;
            const targetH = embeddedImage.width;
            const scale = Math.min(maxW / targetW, maxH / targetH);
            const drawW = targetW * scale;
            const drawH = targetH * scale;
            const drawX = (a4W - drawW) / 2;
            const drawY = (a4H - drawH) / 2;
            page.drawImage(embeddedImage, {
              x: drawX + drawW,
              y: drawY,
              width: embeddedImage.width * scale,
              height: embeddedImage.height * scale,
              rotate: degrees(90),
            });
          } else {
            const dims = embeddedImage.scaleToFit(maxW, maxH);
            page.drawImage(embeddedImage, {
              x: (a4W - dims.width) / 2,
              y: (a4H - dims.height) / 2,
              width: dims.width,
              height: dims.height,
            });
          }

          const pdfBytes = await singlePdf.save();
          finalBuffer = Buffer.from(pdfBytes);
          finalFileName = (f.fileName || 'photo').replace(/\.[^.]+$/, '') + '.pdf';
          finalMimeType = 'application/pdf';
          totalPages = 1;
          isLandscapeDefault = false;
          isMergedBatch = false;
        } else {
          finalBuffer = f.buffer;
          finalFileName = f.fileName;
          finalMimeType = f.mimeType;
          totalPages = f.pages;
          isLandscapeDefault = false;
          isMergedBatch = false;
        }
      } catch (err) {
        finalBuffer = f.buffer;
        finalFileName = f.fileName;
        finalMimeType = f.mimeType;
        totalPages = f.pages;
        isLandscapeDefault = false;
        isMergedBatch = false;
      }
    } else {
      finalBuffer = f.buffer;
      finalFileName = f.fileName;
      finalMimeType = f.mimeType;
      totalPages = f.pages;
      isLandscapeDefault = f.isLandscape;
      isMergedBatch = false;
    }
  } else {
    // Multi-file batch! Merge all files into 1 clean A4 PDF document
    isMergedBatch = true;
    console.log(`[WA-Bot] 📦 Multi-file batch: Merging ${files.length} items for ${senderName}`);

    try {
      const mergedPdf = await PDFDocument.create();

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const isPdf = f.isPdf || (f.buffer && f.buffer.length >= 4 && f.buffer.slice(0, 4).toString() === '%PDF') || (f.fileName && f.fileName.toLowerCase().endsWith('.pdf')) || (f.mimeType && f.mimeType.includes('pdf'));
        const isImg = !isPdf && (f.isImg || (f.mimeType && f.mimeType.startsWith('image/')) || (f.fileName && /\.(jpe?g|png|webp|bmp)$/i.test(f.fileName)));

        if (isPdf) {
          try {
            const srcDoc = await PDFDocument.load(f.buffer, { ignoreEncryption: true });
            srcDoc.isEncrypted = false;
            const indices = srcDoc.getPageIndices();
            const copiedPages = await mergedPdf.copyPages(srcDoc, indices);
            for (const p of copiedPages) {
              mergedPdf.addPage(p);
            }
            console.log(`[WA-Bot] 📑 Appended PDF item ${i + 1}/${files.length} (${copiedPages.length} pages): ${f.fileName}`);
          } catch (pdfErr) {
            console.warn(`[WA-Bot] ⚠️ Could not append PDF item ${i + 1}:`, pdfErr.message);
          }
        } else if (isImg) {
          try {
            let embeddedImage;
            const isPng = f.buffer.length > 24 && f.buffer[0] === 0x89 && f.buffer[1] === 0x50;
            if (isPng) {
              try { embeddedImage = await mergedPdf.embedPng(f.buffer); }
              catch (e) { embeddedImage = await mergedPdf.embedJpg(f.buffer); }
            } else {
              try { embeddedImage = await mergedPdf.embedJpg(f.buffer); }
              catch (e) { embeddedImage = await mergedPdf.embedPng(f.buffer); }
            }

            if (embeddedImage) {
              const a4W = 595.28;
              const a4H = 841.89;
              const page = mergedPdf.addPage([a4W, a4H]);
              const margin = 24;
              const maxW = a4W - (margin * 2);
              const maxH = a4H - (margin * 2);

              if (embeddedImage.width > embeddedImage.height) {
                // Auto-rotate sideways document 90° CCW so it is upright on Portrait A4
                const targetW = embeddedImage.height;
                const targetH = embeddedImage.width;
                const scale = Math.min(maxW / targetW, maxH / targetH);
                const drawW = targetW * scale;
                const drawH = targetH * scale;
                const drawX = (a4W - drawW) / 2;
                const drawY = (a4H - drawH) / 2;
                page.drawImage(embeddedImage, {
                  x: drawX + drawW,
                  y: drawY,
                  width: embeddedImage.width * scale,
                  height: embeddedImage.height * scale,
                  rotate: degrees(90),
                });
              } else {
                const dims = embeddedImage.scaleToFit(maxW, maxH);
                page.drawImage(embeddedImage, {
                  x: (a4W - dims.width) / 2,
                  y: (a4H - dims.height) / 2,
                  width: dims.width,
                  height: dims.height,
                });
              }
            }
          } catch (imgErr) {
            console.warn(`[WA-Bot] Could not embed image item ${i + 1}:`, imgErr.message);
          }
        }
      }

      totalPages = mergedPdf.getPageCount();
      if (totalPages === 0) {
        mergedPdf.addPage([595.28, 841.89]);
        totalPages = 1;
      }

      const mergedBytes = await mergedPdf.save();
      finalBuffer = Buffer.from(mergedBytes);
      finalFileName = `Merged_${files.length}_files.pdf`;
      finalMimeType = 'application/pdf';
      isLandscapeDefault = false;
    } catch (mergeErr) {
      console.error('[WA-Bot] Batch merge failed, falling back to first item:', mergeErr);
      finalBuffer = files[0].buffer;
      finalFileName = files[0].fileName;
      finalMimeType = files[0].mimeType;
      totalPages = files[0].pages || 1;
      isMergedBatch = false;
    }
  }

  // Upload to Cloudflare R2 asynchronously so Step 1 buttons pop up immediately without waiting for network upload
  const randomPrefix = crypto.randomUUID().slice(0, 8);
  const cleanBaseName = finalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const r2Key = `uploads/wa-${randomPrefix}-${cleanBaseName}`;

  const r2UploadPromise = s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      Body: finalBuffer,
      ContentType: finalMimeType,
    })
  ).catch((err) => {
    console.error('[WA-Bot R2 Upload Error]:', err.message);
  });

  const fileSizeMb = (finalBuffer.length / (1024 * 1024)).toFixed(2);

  session.stage = 'AWAITING_COLOR_MODE';
  session.fileKey = r2Key;
  session.fileName = finalFileName;
  session.totalPages = totalPages;
  session.fileSizeMb = fileSizeMb;
  session.mimeType = finalMimeType;
  session.isLandscapeDefault = isLandscapeDefault;
  session.orientation = isLandscapeDefault ? 'landscape' : 'portrait';
  session.timestamp = Date.now();
  session.imageBuffer = (!isMergedBatch && finalMimeType.startsWith('image/')) ? finalBuffer : null;
  session.fileBuffer = finalBuffer;
  session.isMergedBatch = isMergedBatch;
  session.batchCount = files.length;
  session.uploadPromise = r2UploadPromise;

  // Pre-generate preview image in background for instant 0ms preview response
  generatePreviewImage({
    inputBuffer: finalBuffer,
    fileName: finalFileName,
    colorMode: 'bw',
    selectedPages: null,
  }).catch(() => {});

  if (isMergedBatch) {
    await sock.sendMessage(senderJid, {
      text:
        `📦 *Batch Ready: Combined ${files.length} Files into 1 Document!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📑 Total Pages: *${totalPages}*\n` +
        `💾 Combined Size: *${fileSizeMb} MB*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_All files will print together in sequence under 1 single pickup code._`,
    });
  }

  await sendStep1Buttons(sock, senderJid, finalFileName, totalPages, fileSizeMb);
  console.log(`[WA-Bot] Queue finalized for ${senderName}: ${finalFileName} (${totalPages}p)`);
}

/**
 * Ingestion Debounce Processor: Appends buffered files to the user's print queue
 */

/**
 * Recursively penetrates any WhatsApp container wrappers (documentWithCaptionMessage,
 * ephemeralMessage, viewOnceMessage, interactiveMessage, etc.) using BFS queue traversal
 * to extract raw media payload without dropping nested attachments.
 */
function extractMediaFromMessage(rawMessage) {
  if (!rawMessage) return null;
  const queue = [rawMessage];
  const visited = new Set();

  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr || typeof curr !== 'object' || visited.has(curr)) continue;
    visited.add(curr);

    if (curr.documentMessage) {
      return {
        mediaObj: curr.documentMessage,
        mediaType: 'document',
        fileName: curr.documentMessage.fileName || 'document.pdf',
        mimeType: curr.documentMessage.mimetype || 'application/pdf',
      };
    }
    if (curr.imageMessage) {
      const randTag = crypto.randomBytes(3).toString('hex');
      return {
        mediaObj: curr.imageMessage,
        mediaType: 'image',
        fileName: curr.imageMessage.fileName || `photo_${Date.now().toString().slice(-4)}_${randTag}.jpg`,
        mimeType: curr.imageMessage.mimetype || 'image/jpeg',
      };
    }

    if (curr.message) queue.push(curr.message);
    if (curr.documentWithCaptionMessage) queue.push(curr.documentWithCaptionMessage);
    if (curr.ephemeralMessage) queue.push(curr.ephemeralMessage);
    if (curr.viewOnceMessage) queue.push(curr.viewOnceMessage);
    if (curr.viewOnceMessageV2) queue.push(curr.viewOnceMessageV2);
    if (curr.viewOnceMessageV2Extension) queue.push(curr.viewOnceMessageV2Extension);
    if (curr.interactiveMessage) queue.push(curr.interactiveMessage);
    if (curr.header) queue.push(curr.header);
    if (curr.templateMessage) queue.push(curr.templateMessage);
    if (curr.hydratedTemplate) queue.push(curr.hydratedTemplate);
    if (curr.deviceSentMessage) queue.push(curr.deviceSentMessage);

    for (const key of Object.keys(curr)) {
      if (curr[key] && typeof curr[key] === 'object' && !visited.has(curr[key]) && key !== 'contextInfo' && key !== 'clientFilters' && key !== 'key') {
        queue.push(curr[key]);
      }
    }
  }
  return null;
}

// Concurrency semaphore for WhatsApp media downloads (allows up to 4 concurrent downloads to prevent socket starvation)
let activeMediaDownloads = 0;
const mediaDownloadQueue = [];

function acquireMediaDownloadSlot() {
  return new Promise((resolve) => {
    if (activeMediaDownloads < 4) {
      activeMediaDownloads++;
      resolve();
    } else {
      mediaDownloadQueue.push(resolve);
    }
  });
}

function releaseMediaDownloadSlot() {
  activeMediaDownloads = Math.max(0, activeMediaDownloads - 1);
  if (mediaDownloadQueue.length > 0) {
    const next = mediaDownloadQueue.shift();
    activeMediaDownloads++;
    next();
  }
}

/**
 * Downloads media directly using Baileys downloadContentFromMessage protocol stream.
 * Bypasses container bugs (documentWithCaptionMessage) and uses per-file AbortSignal timeout.
 */
async function downloadMediaWithRetry(mediaObj, mediaType, rawMsg, sock, maxAttempts = 3) {
  await acquireMediaDownloadSlot();
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 1. Primary: Direct protocol stream extraction via downloadContentFromMessage
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const stream = await downloadContentFromMessage(mediaObj, mediaType, {
            options: { signal: controller.signal },
          });
          const chunks = [];
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          const buf = Buffer.concat(chunks);
          if (buf && buf.length > 0) return buf;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (streamErr) {
        console.warn(`[WA-Bot] Direct stream attempt ${attempt}/${maxAttempts} (${mediaType}): ${streamErr.message}`);
      }

      // 2. Secondary fallback: High-level downloadMediaMessage with normalized unwrapped structure
      try {
        const normalizedMsg = {
          key: rawMsg?.key,
          message: {
            [mediaType === 'document' ? 'documentMessage' : 'imageMessage']: mediaObj,
          },
        };
        const buf = await downloadMediaMessage(
          normalizedMsg,
          'buffer',
          {},
          {
            logger: pino({ level: 'silent' }),
            reuploadRequest: sock?.updateMediaMessage,
          }
        );
        if (buf && buf.length > 0) return buf;
      } catch (highLevelErr) {
        console.warn(`[WA-Bot] High-level download attempt ${attempt}/${maxAttempts}: ${highLevelErr.message}`);
      }

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    return null;
  } finally {
    releaseMediaDownloadSlot();
  }
}

async function processBufferedFiles({ sock, senderJid, normalizedJid, senderName }) {
  const entry = incomingFileBuffers.get(normalizedJid);
  if (!entry || entry.files.length === 0) return;
  // Atomically splice available files so concurrent in-flight downloads continue undisturbed
  const files = entry.files.splice(0, entry.files.length);
  if ((entry.activeDownloads || 0) === 0) {
    incomingFileBuffers.delete(normalizedJid);
  }

  let session = userSessions.get(senderJid) || userSessions.get(normalizedJid);

  // If user cancelled, discard any stale session
  const cancelledAt = cancelledTimestamps.get(normalizedJid) || 0;
  if (cancelledAt && session && (session.timestamp || 0) <= cancelledAt) {
    session = null;
  }

  // If user was previously in configuration stages (AWAITING_COLOR_MODE / AWAITING_PAGE_SELECTION / AWAITING_COPIES),
  // receiving new files seamlessly reverts stage back to QUEUE_STAGING and appends to the queue so all files are printed together
  if (session && (session.stage === 'AWAITING_COLOR_MODE' || session.stage === 'AWAITING_PAGE_SELECTION' || session.stage === 'AWAITING_COPIES' || session.stage === 'AWAITING_SUMMARY_CONFIRMATION')) {
    session.stage = 'QUEUE_STAGING';
    session.fileKey = null;
    session.fileName = null;
    session.fileBuffer = null;
    session.isMergedBatch = false;
  }

  // Intentional addition window: 5 minutes (300,000ms) as requested by user
  const isRecentBatch = session && (Date.now() - (session.timestamp || 0) < 300000) && session.stage !== 'COMPLETED' && session.stage !== 'AWAITING_PAYMENT';
  const shouldRetainQueue = isRecentBatch;

  if (!session || !shouldRetainQueue || isSessionExpired(session) || session.stage === 'COMPLETED') {
    session = {
      stage: 'QUEUE_STAGING',
      senderJid,
      senderName,
      station: defaultStation,
      timestamp: Date.now(),
      queuedFiles: [],
    };
    userSessions.set(senderJid, session);
    userSessions.set(normalizedJid, session);
  }

  // Ensure queuedFiles array exists
  if (!session.queuedFiles) {
    session.queuedFiles = [];
  }

  // If user was already waiting for payment, notify them about their pending order
  if (session.stage === 'AWAITING_PAYMENT') {
    await sock.sendMessage(senderJid, {
      text:
        `⚠️ *Pending Order in Progress*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `You already have an unpaid order for *${session.fileName}* (₹${session.totalPrice || 0}).\n\n` +
        (session.paymentLinkUrl ? `🔗 *UPI Payment Link:* ${session.paymentLinkUrl}\n\n` : '') +
        `• To print this new file instead, reply with *cancel* to discard the old order.\n` +
        `• To proceed with the pending order, tap the payment link above!`,
    });
    return;
  }

  const justAddedNames = [];

  for (const file of files) {
    if (session.queuedFiles.length >= 15) {
      await sock.sendMessage(senderJid, {
        text: `⚠️ *Queue Limit:* Maximum 15 files per print batch reached. Please continue to print these files first!`,
      });
      break;
    }

    const sizeMb = (file.buffer.length / (1024 * 1024)).toFixed(2);
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Strict Deduplication Check: Prevent duplicate files using msgId or buffer sha256 hash
    const isDuplicate = session.queuedFiles.some(existing => {
      if (file.msgId && existing.msgId && existing.msgId === file.msgId) return true;
      if (existing.hash && existing.hash === fileHash) return true;
      return false;
    });
    if (isDuplicate) {
      console.log(`[WA-Bot] ⏭️ Skipping duplicate file "${file.fileName}" (msgId: ${file.msgId || 'none'})`);
      continue;
    }

    let pages = 1;
    let isLandscape = false;

    const isPdfItem = file.isPdf || (file.buffer && file.buffer.length >= 4 && file.buffer.slice(0, 4).toString() === '%PDF') || (file.fileName && file.fileName.toLowerCase().endsWith('.pdf')) || (file.mimeType && file.mimeType.includes('pdf'));
    if (isPdfItem) {
      try {
        const pdfDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
        pdfDoc.isEncrypted = false;
        pages = pdfDoc.getPageCount();
        const firstPage = pdfDoc.getPages()[0];
        if (firstPage) {
          const { width, height } = firstPage.getSize();
          isLandscape = width > height;
        }
      } catch (err) {
        console.warn(`[WA-Bot] pdf-lib load failed on ${file.fileName}, attempting secondary regex parse:`, err.message);
        try {
          const binStr = file.buffer.toString('binary');
          const matches = binStr.match(/\/Type\s*\/Page(?!s)\b/g);
          if (matches && matches.length > 0) {
            pages = matches.length;
            console.log(`[WA-Bot] Regex fallback parsed ${pages} pages for ${file.fileName}`);
          } else {
            pages = 1;
          }
        } catch (e2) {
          pages = 1;
        }
      }
    } else if (file.isImg) {
      pages = 1;
      isLandscape = detectImageLandscape(file.buffer);
    }

    session.queuedFiles.push({
      msgId: file.msgId,
      fileName: file.fileName,
      buffer: file.buffer,
      mimeType: file.mimeType,
      pages,
      isLandscape,
      sizeMb,
      hash: fileHash,
      isPdf: isPdfItem,
      isImg: file.isImg,
    });

    justAddedNames.push(file.fileName);
  }

  session.timestamp = Date.now();
  session.senderName = senderName;

  console.log(`[WA-Bot] Processed ${justAddedNames.length} file(s) for ${senderName}. Total queued in batch: ${session.queuedFiles.length}`);

  // Always show Queue Staging Card (Proceed vs Add More vs Cancel) for 100% control & multi-doc bursts
  session.stage = 'QUEUE_STAGING';
  await sendQueueStagingCard({ sock, senderJid, session, justAddedFileNames: justAddedNames });
}

/**
 * Processes an incoming media attachment asynchronously without blocking the Baileys event loop.
 * Enables simultaneous burst ingestion (e.g. 3 PDFs + 2 images sent together) by immediately
 * tracking active downloads, applying instant reactions, and releasing the event loop.
 */
function handleIncomingMediaAttachment({
  msg,
  sock,
  senderJid,
  normalizedJid,
  senderName,
  extracted,
}) {
  const { mediaObj, mediaType } = extracted;
  let fileName = extracted.fileName;
  let mimeType = extracted.mimeType;
  const currentMsgId = msg?.key?.id;
  const now = Date.now();
  const cancelledAt = cancelledTimestamps.get(normalizedJid) || 0;
  const msgTsSec = getMessageTimestampSec(msg);
  const msgTsMs = msgTsSec > 0 ? msgTsSec * 1000 : now;
  if (msgTsMs <= cancelledAt) {
    console.log(`[WA-Bot] ⏭️ Skipping media attachment received at or prior to cancellation: "${fileName}" (msgTs=${msgTsMs}, cancelledAt=${cancelledAt})`);
    return;
  }

  // Ensure photos always have a unique filename derived from WhatsApp message ID or unique tag
  if (mediaType === 'image' && (!fileName || fileName.startsWith('photo_'))) {
    const cleanId = (currentMsgId || crypto.randomBytes(3).toString('hex')).replace(/[^a-zA-Z0-9]/g, '').slice(-8);
    fileName = `photo_${cleanId}.jpg`;
  }

  console.log(`[WA-Bot] 📥 Media attachment received from ${senderName} (${senderJid}): "${fileName}" (${mediaType}) [id: ${currentMsgId || 'none'}]`);

  // Cache in recentChatMedia (sliding window of 5 minutes for Rescan & deduplication)
  if (!recentChatMedia.has(normalizedJid)) {
    recentChatMedia.set(normalizedJid, []);
  }
  const mediaHistory = recentChatMedia.get(normalizedJid);
  const validRecent = mediaHistory.filter(i => (now - i.timestamp) < RESCAN_WINDOW_MS);
  if (currentMsgId && !validRecent.some(i => i.msgId === currentMsgId)) {
    validRecent.push({
      msgId: currentMsgId,
      msgKey: msg?.key,
      rawMsg: msg,
      mediaObj,
      mediaType,
      fileName,
      mimeType,
      timestamp: now,
      status: 'downloading',
    });
  }
  recentChatMedia.set(normalizedJid, validRecent);

  if (!incomingFileBuffers.has(normalizedJid)) {
    incomingFileBuffers.set(normalizedJid, {
      files: [],
      timer: null,
      activeDownloads: 0,
      hasNotified: false,
    });
  }
  const entry = incomingFileBuffers.get(normalizedJid);
  entry.activeDownloads = (entry.activeDownloads || 0) + 1;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  // Instant emoji reaction on the file's message bubble
  sock.sendMessage(senderJid, {
    react: { text: '⏳', key: msg.key },
  }).catch(() => {});
  sock.sendPresenceUpdate('composing', senderJid).catch(() => {});

  const lowerDocName = fileName.toLowerCase();
  const rawMime = mimeType.toLowerCase();
  const isPdfFile = lowerDocName.endsWith('.pdf') || rawMime.includes('pdf');
  const isPhotoFile = !isPdfFile && (mediaType === 'image' || rawMime.startsWith('image/'));
  const isDocxFile = lowerDocName.endsWith('.docx') || lowerDocName.endsWith('.doc');

  let prepNotice = '⏳ *Receiving your files...*\nPlease wait a moment.\n\n💡 _Tip: Check that each file gets a reaction emoji (📄/🖼️) once added to your queue!_';
  if (isPdfFile) {
    prepNotice = fileName
      ? `⏳ *Your PDF is preparing...*\n📄 _${fileName}_\nPlease wait a moment.\n\n💡 _Tip: Check that each file gets a reaction emoji (📄/🖼️) once added to your queue!_`
      : `⏳ *Your PDF is preparing...*\nPlease wait a moment.\n\n💡 _Tip: Check that each file gets a reaction emoji (📄/🖼️) once added to your queue!_`;
  } else if (isPhotoFile) {
    prepNotice = `⏳ *Your photo is preparing...*\nPlease wait a moment.\n\n💡 _Tip: Check that each file gets a reaction emoji (📄/🖼️) once added to your queue!_`;
  } else if (isDocxFile) {
    prepNotice = `⏳ *Your Word document is preparing...*\n📄 _${fileName}_\nPlease wait a moment.\n\n💡 _Tip: Check that each file gets a reaction emoji (📄/🖼️) once added to your queue!_`;
  }

  if (!entry.hasNotified) {
    entry.hasNotified = true;
    sock.sendMessage(senderJid, { text: prepNotice }, { quoted: msg }).catch(() => {});
  }

  const debounceDelay = 7500;
  const scheduleProcess = () => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(async () => {
      if (entry.activeDownloads > 0) {
        console.log(`[WA-Bot] ${entry.activeDownloads} download(s) still active for ${senderName}. Rescheduling buffer process...`);
        scheduleProcess();
        return;
      }
      try {
        await processBufferedFiles({ sock: activeBotSock || sock, senderJid, normalizedJid, senderName });
      } catch (err) {
        console.error('[WA-Bot] Error processing buffered files:', err);
      }
    }, debounceDelay);
  };

  // Asynchronous background download worker
  (async () => {
    let buffer = null;
    try {
      buffer = await downloadMediaWithRetry(mediaObj, mediaType, msg, sock, 3);
    } catch (dlErr) {
      console.warn('[WA-Bot] Media download error:', dlErr.message);
    }

    if (!buffer || buffer.length === 0) {
      entry.activeDownloads = Math.max(0, (entry.activeDownloads || 1) - 1);
      console.error(`[WA-Bot] ❌ Failed to download attachment "${fileName}" from ${senderName}`);
      sock.sendMessage(senderJid, {
        react: { text: '❌', key: msg.key },
      }).catch(() => {});
      await sock.sendMessage(senderJid, {
        text: `⚠️ *File Transfer Issue:*\nFailed to download "${fileName}". Receiving multiple files is limited due to WhatsApp policy. Please send them merged inside a single PDF or resend the files that do not have a reaction emoji.`,
      }).catch(() => {});
      if (entry.files.length > 0) {
        scheduleProcess();
      }
      return;
    }

    // Local Word (.docx / .doc) conversion
    if (fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc')) {
      console.log(`[WA-Bot] Word document detected: ${fileName}. Checking local converter...`);
      await sock.sendMessage(
        senderJid,
        {
          text:
            `🔄 *Word Document (.docx) Detected*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📄 Converting *"${fileName}"* into a print-ready vector PDF on the PrintKurox server...\n\n` +
            `⏳ _It will take a few seconds, converting..._`,
        },
        { quoted: msg }
      ).catch(() => {});

      const convertedPdf = await convertDocxToPdf(buffer, fileName);
      if (convertedPdf) {
        buffer = convertedPdf;
        fileName = fileName.replace(/\.docx?$/i, '.pdf');
        mimeType = 'application/pdf';
        console.log(`[WA-Bot] Converted Word document locally: ${fileName}`);
        await sock.sendMessage(
          senderJid,
          {
            text:
              `✅ *Document Converted Successfully!*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `📄 *${fileName}* is ready and added to your print queue! ✨`,
          },
          { quoted: msg }
        ).catch(() => {});
      } else {
        entry.activeDownloads = Math.max(0, (entry.activeDownloads || 1) - 1);
        await sock.sendMessage(
          senderJid,
          {
            text:
              `⚠️ *Word Document (.docx) Detected*\n\n` +
              `To ensure your fonts, tables, margins, and layout do not shift or distort, please save or export your file as a *PDF* and send it here!\n\n` +
              `📌 *How to save as PDF:*\n` +
              `• In MS Word: _File ➔ Save As ➔ PDF (*.pdf)_\n` +
              `• In Google Docs: _File ➔ Download ➔ PDF Document_\n` +
              `• On phone: Share ➔ Print ➔ Save as PDF.\n\n` +
              `_Forward your PDF once saved to print instantly!_`,
          },
          { quoted: msg }
        ).catch(() => {});
        if (entry.files.length > 0) {
          scheduleProcess();
        }
        return;
      }
    }

    const isPdfDetected = (buffer.length >= 4 && buffer.slice(0, 4).toString() === '%PDF') ||
      fileName.toLowerCase().endsWith('.pdf') ||
      mimeType.includes('pdf');
    const isImgDetected = !isPdfDetected && (mediaType === 'image' || mimeType.startsWith('image/'));

    // Update message bubble reaction to document/photo on successful download
    sock.sendMessage(senderJid, {
      react: { text: isPdfDetected ? '📄' : '🖼️', key: msg.key },
    }).catch(() => {});

    // If session was cancelled in-flight, discard downloaded buffer immediately
    if ((cancelledTimestamps.get(normalizedJid) || 0) >= now) {
      console.log(`[WA-Bot] 🗑️ Discarding downloaded attachment "${fileName}" because session was cancelled in-flight`);
      entry.activeDownloads = Math.max(0, (entry.activeDownloads || 1) - 1);
      return;
    }

    entry.files.push({
      msgId: currentMsgId,
      buffer,
      fileName,
      mimeType,
      isImg: isImgDetected,
      isPdf: isPdfDetected,
    });

    // Decrement activeDownloads ONLY AFTER pushing to entry.files to prevent premature buffer flush!
    entry.activeDownloads = Math.max(0, (entry.activeDownloads || 1) - 1);

    const cachedItem = (recentChatMedia.get(normalizedJid) || []).find(i => i.msgId === currentMsgId);
    if (cachedItem) cachedItem.status = 'downloaded';

    scheduleProcess();
  })().catch((err) => {
    console.error(`[WA-Bot] Unhandled error downloading ${fileName}:`, err);
    entry.activeDownloads = Math.max(0, (entry.activeDownloads || 1) - 1);
    if (entry.files.length > 0) {
      scheduleProcess();
    }
  });
}

// ============================================================================
// MAIN BAILEYS WHATSAPP BOT DAEMON
// ============================================================================

let activeBotSock = null;
let currentSocketGeneration = 0;
let isStartingBot = false;
let reconnectTimer = null;
let currentLivenessTimer = null;
let currentHeartbeatTimer = null;

function scheduleReconnect(delayMs, reason = '') {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  appendBotLog(`[WA-Bot] Scheduling single reconnect in ${delayMs}ms${reason ? ' (' + reason + ')' : ''}`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot();
  }, delayMs);
}

async function startBot() {
  if (isStartingBot) {
    appendBotLog('[WA-Bot] Skipping duplicate startBot() call while startup is in progress.');
    return;
  }
  isStartingBot = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (currentLivenessTimer) {
    clearInterval(currentLivenessTimer);
    currentLivenessTimer = null;
  }
  if (currentHeartbeatTimer) {
    clearInterval(currentHeartbeatTimer);
    currentHeartbeatTimer = null;
  }

  const generation = ++currentSocketGeneration;

  // Cleanly tear down any prior socket so two sockets never fight over session_auth keys
  if (activeBotSock) {
    try { activeBotSock.ev?.removeAllListeners?.(); } catch (e) {}
    try { activeBotSock.ws?.terminate?.(); } catch (e) {}
    try { activeBotSock.end?.(new Error('Replaced by fresh socket')); } catch (e) {}
    activeBotSock = null;
  }

  try {
  const authDir = path.join(__dirname, 'session_auth');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  let version = [2, 3000, 1015901307];
  try {
    const vData = await fetchLatestBaileysVersion();
    if (vData && vData.version) version = vData.version;
  } catch (vErr) {
    console.warn(`[WA-Bot] Version check offline (${vErr.message}), using fallback.`);
  }

  console.log(`[WA-Bot] Using Baileys version ${version.join('.')}`);

  // Preserve botSentIds across reconnects so sent messages are never re-processed
  const heartbeatPath = path.join(__dirname, 'bot_heartbeat.json');
  let lastTrafficTime = Date.now();

  const updateHeartbeat = (connected = false) => {
    try {
      const hb = {
        pid: process.pid,
        timestamp: Date.now(),
        iso: new Date().toISOString(),
        connected,
        uptimeSec: Math.floor(process.uptime()),
        lastTrafficAgoSec: Math.floor((Date.now() - lastTrafficTime) / 1000)
      };
      fs.writeFileSync(heartbeatPath, JSON.stringify(hb, null, 2), 'utf8');
    } catch (e) {}
  };

  updateHeartbeat(false);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['PrintKurox Kiosk', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    keepAliveIntervalMs: 20000,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    getMessage: async (key) => {
      return messageStore.get(key.id);
    },
  });

  const origSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const result = await origSendMessage(...args);
    if (result?.key?.id) {
      botSentIds.add(result.key.id);
      if (botSentIds.size > 2000) {
        const first = botSentIds.values().next().value;
        botSentIds.delete(first);
      }
    }
    return result;
  };

  sock.ev.on('creds.update', saveCreds);

  activeBotSock = sock;

  sock.ev.on('connection.update', (update) => {
    if (generation !== currentSocketGeneration) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[WA-Bot] SCAN THE QR CODE BELOW USING WHATSAPP:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nWaiting for QR scan...\n');
    }

    if (connection === 'close') {
      if (currentLivenessTimer) { clearInterval(currentLivenessTimer); currentLivenessTimer = null; }
      if (currentHeartbeatTimer) { clearInterval(currentHeartbeatTimer); currentHeartbeatTimer = null; }
      updateHeartbeat(false);

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      const warnMsg = `[WA-Bot] Connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`;
      console.warn(warnMsg);
      appendBotLog(warnMsg);

      if (shouldReconnect) {
        // If connection was replaced (440), wait 15 seconds to prevent spam conflict fight
        const delay = statusCode === 440 ? 15000 : 3000;
        scheduleReconnect(delay, `status=${statusCode}`);
      } else {
        const errMsg = '[WA-Bot] Logged out from WhatsApp. Delete "session_auth" folder and scan QR again.';
        console.error(errMsg);
        appendBotLog(errMsg);
      }
    } else if (connection === 'open') {
      activeBotSock = sock;
      lastTrafficTime = Date.now();
      updateHeartbeat(true);

      const successMsg = `[SUCCESS] PrintKurox WhatsApp Bot is ONLINE & READY! (PID: ${process.pid})`;
      console.log('------------------------------------------------------------');
      console.log(successMsg);
      console.log('IndiGo-Style Action Buttons & Instant Payments Active.');
      console.log('------------------------------------------------------------\n');
      appendBotLog(successMsg);

      // Clean existing timers if any
      if (currentLivenessTimer) { clearInterval(currentLivenessTimer); currentLivenessTimer = null; }
      if (currentHeartbeatTimer) { clearInterval(currentHeartbeatTimer); currentHeartbeatTimer = null; }

      // Active Heartbeat writer every 15 seconds
      currentHeartbeatTimer = setInterval(() => {
        if (generation !== currentSocketGeneration) return;
        updateHeartbeat(true);
      }, 15000);

      // WebSocket Liveness & Anti-Zombie Watchdog (detects silent firewall disconnects / captive portal resets)
      currentLivenessTimer = setInterval(() => {
        if (generation !== currentSocketGeneration) return;
        const ws = sock.ws;
        if (!ws) return;

        // Check WebSocket readyState: 1 = OPEN
        if (ws.readyState === 1) {
          try {
            ws.ping();
          } catch (e) {}

          const quietSec = (Date.now() - lastTrafficTime) / 1000;
          if (quietSec > 90) {
            const staleMsg = `[WA-Bot Watchdog] Zombie connection detected (${Math.floor(quietSec)}s without traffic/pong). Forcing clean reconnect...`;
            console.warn(staleMsg);
            appendBotLog(staleMsg);
            if (currentLivenessTimer) { clearInterval(currentLivenessTimer); currentLivenessTimer = null; }
            if (currentHeartbeatTimer) { clearInterval(currentHeartbeatTimer); currentHeartbeatTimer = null; }
            try { ws.terminate(); } catch (e) {}
            try { sock.end(new Error('Liveness timeout')); } catch (e) {}
            scheduleReconnect(2000, 'liveness timeout');
          }
        } else if (ws.readyState === 2 || ws.readyState === 3) {
          const closedWsMsg = `[WA-Bot Watchdog] WebSocket is dead (state: ${ws.readyState}). Triggering single clean restart...`;
          console.warn(closedWsMsg);
          appendBotLog(closedWsMsg);
          if (currentLivenessTimer) { clearInterval(currentLivenessTimer); currentLivenessTimer = null; }
          if (currentHeartbeatTimer) { clearInterval(currentHeartbeatTimer); currentHeartbeatTimer = null; }
          updateHeartbeat(false);
          scheduleReconnect(2000, `ws state=${ws.readyState}`);
        }
      }, 20000);

      // Attach WS ping/pong listeners
      if (sock.ws) {
        try {
          sock.ws.on('pong', () => { lastTrafficTime = Date.now(); });
          sock.ws.on('message', () => { lastTrafficTime = Date.now(); });
        } catch (e) {}
      }

      // Start server power watchdog & send startup notification once to admin (9863013886)
      onBotConnectionOpen({
        getSock: () => activeBotSock,
        sendInteractiveButtons,
        logFn: appendBotLog,
      }).catch((err) => appendBotLog(`[Server Controller] Open hook error: ${err.message}`));

      // Start Cinderac Web Auth Server and Register Push Callback (Once per process)
      if (!global.__webAuthServerInitialized) {
        global.__webAuthServerInitialized = true;
        try {
          startWebAuthServer(7260);
          startCloudflaredTunnel(7260);
          setOnAuthSuccess(async (senderJid, phone, syncResult) => {
            try {
              if (!activeBotSock) return;
              const targetJid = senderJid || (phone ? `${phone}@s.whatsapp.net` : null);
              if (!targetJid) return;

              const prof = syncResult.profile;
              const courses = syncResult.courses || [];
              let listText = '';
              courses.slice(0, 7).forEach((c, idx) => {
                listText += `${idx + 1}. *${c.code}* — ${c.name}\n   Faculty: ${c.faculty}\n`;
              });

              if (courses.length > 0) {
                const coverObj = {
                  subjectName: courses[0].name,
                  subjectCode: courses[0].code,
                  assignmentTitle: 'ASSIGNMENT',
                  studentName: prof.fullName,
                  rollNo: prof.rollNo,
                  department: prof.departmentName,
                  yearSemester: `B.Tech Semester ${prof.semester}`,
                  teacherName: courses[0].faculty,
                  teacherDesignation: 'Assistant Professor',
                  academicSession: '2026-2027 Jul-Dec',
                  timestamp: Date.now()
                };
                saveCoverDraft(targetJid, null, phone, coverObj);
              }

              userLastOpenedStudio.set(targetJid, 'cinderac_cover');

              const body =
                `*Cinderac Account Verified & Synced*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Student: *${prof.fullName}* (${prof.rollNo})\n` +
                `Department: ${prof.departmentName} (Semester ${prof.semester})\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `*Enrolled Subjects (${courses.length} Courses):*\n` +
                listText +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `_Select an enrolled subject below or reply 1 to ${Math.min(courses.length, 7)} to generate an official front cover immediately:_`;

              const buttons = [];
              if (courses[0]) buttons.push({ id: 'btn_cind_course_1', text: `1. ${courses[0].code}` });
              if (courses[1]) buttons.push({ id: 'btn_cind_course_2', text: `2. ${courses[1].code}` });
              if (courses[2]) buttons.push({ id: 'btn_cind_course_3', text: `3. ${courses[2].code}` });

              await sendInteractiveButtons({
                sock: activeBotSock,
                jid: targetJid,
                title: 'Cinderac Academic Verified',
                body,
                footer: '1-Click Front Cover · Agent Kurox',
                buttons
              });
            } catch (pushErr) {
              appendBotLog(`[WebAuth] ❌ Error in push notification callback: ${pushErr.message}`);
            }
          });
        } catch (authInitErr) {
          appendBotLog(`[WebAuth] ⚠️ Server init notice: ${authInitErr.message}`);
        }
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (generation !== currentSocketGeneration) return;
      if (type !== 'notify') return;
      lastTrafficTime = Date.now();
      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        if (!msg.message || !msg.key?.remoteJid) continue;
        const senderJid = msg.key.remoteJid;
        if (
          senderJid === 'status@broadcast' ||
          senderJid.endsWith('@newsletter') ||
          senderJid.endsWith('@broadcast')
        ) {
          continue;
        }

        const msgId = msg.key?.id;
        if (msgId && (botSentIds.has(msgId) || hasProcessedMessage(msgId))) {
          continue;
        }

        const msgTsSec = getMessageTimestampSec(msg);
        const nowSec = Math.floor(Date.now() / 1000);
        if (msgTsSec > 0 && (nowSec - msgTsSec) > STALE_MESSAGE_AGE_SEC) {
          appendBotLog(`[Dedup] Ignoring stale replayed message ${msgId || ''} from ${senderJid} (${nowSec - msgTsSec}s old)`);
          if (msgId) markMessageProcessed(msgId);
          continue;
        }

        const normalizedJid = jidNormalizedUser(senderJid);
        const senderName = msg.pushName || 'Student';
        lastTrafficTime = Date.now();
        const isGroup = senderJid.endsWith('@g.us');

        // Normalize content to unwrap viewOnce / ephemeral wrappers automatically
        const content = normalizeMessageContent(msg.message);
        const rawGroupText = (
          content?.conversation ||
          content?.extendedTextMessage?.text ||
          content?.imageMessage?.caption ||
          content?.documentMessage?.caption ||
          content?.videoMessage?.caption ||
          ''
        ).trim();

        // ======================================================================
        // 0. DETECT BUTTON INTERACTION (NATIVE FLOW QUICK-REPLY / TEMPLATE BUTTON)
        // ======================================================================
        let buttonId = null;
        let buttonText = null;

        const interactive =
          content?.interactiveResponseMessage ||
          msg.message?.interactiveResponseMessage ||
          content?.viewOnceMessage?.message?.interactiveResponseMessage ||
          msg.message?.viewOnceMessage?.message?.interactiveResponseMessage;

        if (interactive?.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
            buttonId = params.id;
            console.log(`[WA-Bot] 🔘 Native flow button tapped by ${senderName}: id="${buttonId}"`);
          } catch (e) {
            console.warn('[WA-Bot] Failed to parse nativeFlowResponseMessage paramsJson:', e.message);
          }
        }

        if (!buttonId && (content?.templateButtonReplyMessage || msg.message?.templateButtonReplyMessage)) {
          const t = content?.templateButtonReplyMessage || msg.message?.templateButtonReplyMessage;
          buttonId = t.selectedId;
          buttonText = t.selectedDisplayText;
        }

        if (!buttonId && (content?.buttonsResponseMessage || msg.message?.buttonsResponseMessage)) {
          const b = content?.buttonsResponseMessage || msg.message?.buttonsResponseMessage;
          buttonId = b.selectedButtonId;
          buttonText = b.selectedDisplayText;
        }

        if (!buttonId && (content?.listResponseMessage || msg.message?.listResponseMessage)) {
          const l = content?.listResponseMessage || msg.message?.listResponseMessage;
          buttonId = l.singleSelectReply?.selectedRowId || l.selectedRowId;
          buttonText = l.title;
        }

        let clean = (rawGroupText || buttonText || '').trim().toLowerCase();

        // In groups, respond ONLY to faculty search (@find / !find) or AI chat (@ai / !ai)
        const isGroupAiTrigger = isGroup && !buttonId && /^[@!]ai\b/i.test(rawGroupText || '');
        if (isGroup && !isGroupFacultyCommand(rawGroupText, buttonId) && !isGroupAiTrigger) {
          continue;
        }

        // Check if this message was sent by the bot itself
        if (msgId && botSentIds.has(msgId)) continue;

        const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
        const myLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : null;
        const myPhone = myJid ? myJid.split('@')[0].replace(/[^0-9]/g, '') : '9362980761';
        const isFromMe = msg.key.fromMe === true;

        // Resolve phone number of sender (handling LID reverse mappings)
        const userActivityPhone = await resolveUserPhone(sock, senderJid);

        // Allow fromMe ONLY when the bot account (9362980761) literally messages itself (never for ADMIN_NUMBERS chats)
        const isMessageToSelf = !isGroup && isFromMe && (
          senderJid === myJid ||
          senderJid === myLid ||
          (myPhone && senderJid.includes(myPhone)) ||
          (userActivityPhone && userActivityPhone === myPhone)
        );

        if (isFromMe && !isMessageToSelf) continue;

        // Skip protocol/system-only updates (revokes, disappearing-timer changes, senderKeyDistribution) with no content
        const hasMediaPayload = Boolean(extractMediaFromMessage(content) || extractMediaFromMessage(msg.message));
        if (!buttonId && !rawGroupText && !buttonText && !hasMediaPayload) {
          if (msgId) markMessageProcessed(msgId);
          continue;
        }

        // Persist message ID immediately so reconnects/retries can NEVER re-trigger this message
        if (msgId) markMessageProcessed(msgId);
        appendBotLog(`Incoming message id=${msgId || 'none'} from ${senderName} (${senderJid}) isGroup=${isGroup}`);

        // Acknowledge read receipt asynchronously for DMs
        if (!isGroup) {
          sock.readMessages([msg.key]).catch(() => {});
        }

        let session = userSessions.get(senderJid) || userSessions.get(normalizedJid);
        if (session) session.senderName = senderName;

        // Continuously record active student DM contact for automated audience discovery (skip groups)
        if (!isGroup && userActivityPhone) {
          recordUserActivity(userActivityPhone, senderJid, senderName);
        }

        const rawText =
          content?.conversation ||
          content?.extendedTextMessage?.text ||
          content?.imageMessage?.caption ||
          content?.documentMessage?.caption ||
          content?.videoMessage?.caption ||
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          buttonText ||
          '';

        const trimmedText = rawText.trim();
        const lowerText = trimmedText.toLowerCase();

        // ======================================================================
        // ADMIN COMMANDS (@ad, @preview, @send, #status, #wifilogin, #shutdown, etc.)
        // ======================================================================
        const isAdmin = !isGroup && isSenderAdmin(senderJid, normalizedJid, isMessageToSelf, userActivityPhone);
        const adminReplyJid = isMessageToSelf
          ? (myJid || `91${myPhone}@s.whatsapp.net`)
          : senderJid;

        const saveCampaignState = (campaign) => {
          adminCampaignState.set(senderJid, campaign);
          adminCampaignState.set(normalizedJid, campaign);
          adminCampaignState.set(adminReplyJid, campaign);
          if (isMessageToSelf) adminCampaignState.set('self', campaign);
        };

        const clearCampaignState = () => {
          adminCampaignState.delete(senderJid);
          adminCampaignState.delete(normalizedJid);
          adminCampaignState.delete(adminReplyJid);
          adminCampaignState.delete('self');
        };

        // Preview command: sends promo to self/admin for manual verification or manual forwarding
        if (isAdmin && (lowerText === '@ad' || lowerText === '@preview' || lowerText === '@promo' || lowerText === '@ad_preview')) {
          const promo = getStudentDirectoryPromoCard();
          await sock.sendMessage(adminReplyJid, {
            text:
              `${promo.title}\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `${promo.body}\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `📋 *Admin Quick Guide:*\n` +
              `1. *Forward Manually:* Long-press and forward this card to any student or group.\n\n` +
              `2. *Auto-Discover Audience:* Reply with \`24 hour\` (or \`@send 24 hour\` / \`@send 7d\`) to stage active students and review the list before broadcasting!\n\n` +
              `3. *Targeted Numbers:* Reply with \`@send 9863013886, 9362980761\` to stage specific phone numbers.`,
          });
          continue;
        }

        // ======================================================================
        // ADMIN CAMPAIGN INTERACTIVE EXCLUSION & DISPATCH CONTROLLER
        // (Active staged campaign actions: send, cancel, remove, numeric input)
        // ======================================================================
        const activeCampaign = isAdmin
          ? (adminCampaignState.get(senderJid) ||
             adminCampaignState.get(normalizedJid) ||
             adminCampaignState.get(adminReplyJid) ||
             (isMessageToSelf ? adminCampaignState.get('self') : null))
          : null;

        if (activeCampaign) {
          const cleanAdminText = trimmedText.toLowerCase();

          // 1. Cancel / Exit Campaign
          if (/^(cancel|stop|abort|exit|quit|close|3)$/i.test(cleanAdminText) || buttonId === 'btn_campaign_cancel') {
            if (activeCampaign.isAwaitingRemoval) {
              activeCampaign.isAwaitingRemoval = false;
              await sendCampaignReviewCard({
                sock,
                adminJid: adminReplyJid,
                campaign: activeCampaign,
                noticeText: '⚠️ Removal mode cancelled. Audience list preserved.',
              });
              continue;
            } else {
              clearCampaignState();
              await sock.sendMessage(adminReplyJid, {
                text: '🚫 *Campaign Broadcast Cancelled.*\nNo promotional messages were dispatched.',
              });
              continue;
            }
          }

          // 2. Send / Proceed Broadcast
          if (/^(send|proceed|broadcast|go|ok|1)$/i.test(cleanAdminText) || buttonId === 'btn_campaign_send') {
            clearCampaignState();
            await executeCampaignBroadcast({ sock, adminJid: adminReplyJid, campaign: activeCampaign });
            continue;
          }

          // 3. Remove Command or Direct Numbers to Exclude
          const isRemoveCmd = /^(remove|delete|del|exclude|2)\b/i.test(cleanAdminText) || buttonId === 'btn_campaign_remove';
          const isNumericOnly = /^[\d\s,]+$/.test(cleanAdminText);

          if (isRemoveCmd || activeCampaign.isAwaitingRemoval || isNumericOnly) {
            let rawTarget = '';
            if (activeCampaign.isAwaitingRemoval) {
              rawTarget = cleanAdminText;
            } else {
              rawTarget = cleanAdminText.replace(/^(?:remove|delete|del|exclude|2|btn_campaign_remove)\s*/i, '').trim();
            }

            if (!rawTarget) {
              activeCampaign.isAwaitingRemoval = true;
              await sock.sendMessage(adminReplyJid, {
                text:
                  `❌ *Remove Numbers from Audience*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Reply with the list item number(s) or phone number(s) to exclude.\n\n` +
                  `• *By Item Number:* reply \`1\` or \`1, 2\`\n` +
                  `• *By Phone:* reply \`9366035076\`\n\n` +
                  `_Or reply *cancel* to return to the audience review card._`,
              });
              continue;
            }

            const tokens = rawTarget.split(/[\s,]+/).filter(Boolean);
            const toRemoveIndices = new Set();
            const toRemovePhones = new Set();

            for (const token of tokens) {
              let cleanDigits = token.replace(/[^0-9]/g, '');
              if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) {
                cleanDigits = cleanDigits.slice(-10);
              }
              if (cleanDigits.length === 10) {
                toRemovePhones.add(cleanDigits);
              } else if (cleanDigits.length > 0) {
                const idx = parseInt(cleanDigits, 10);
                if (idx >= 1 && idx <= activeCampaign.recipients.length) {
                  toRemoveIndices.add(idx - 1); // 0-based
                }
              }
            }

            if (toRemoveIndices.size > 0 || toRemovePhones.size > 0) {
              const originalCount = activeCampaign.recipients.length;
              activeCampaign.recipients = activeCampaign.recipients.filter((item, idx) => {
                const p = item.phone.slice(-10);
                if (toRemovePhones.has(p)) return false;
                if (toRemoveIndices.has(idx)) return false;
                return true;
              });
              const removedCount = originalCount - activeCampaign.recipients.length;
              activeCampaign.isAwaitingRemoval = false;
              await sendCampaignReviewCard({
                sock,
                adminJid: adminReplyJid,
                campaign: activeCampaign,
                noticeText: `✅ *Removed ${removedCount} contact(s) from campaign audience.*`,
              });
              continue;
            } else if (activeCampaign.isAwaitingRemoval) {
              await sock.sendMessage(adminReplyJid, {
                text: `⚠️ *No matching contacts found to remove.*\nReply with a valid number from the list (1 to ${activeCampaign.recipients.length}) or a 10-digit phone number, or reply *cancel*.`,
              });
              continue;
            }
          }
        }

        // Targeted or Automated Discovery: "@send 24 hour", "send 24 hour", "24 hour", "24h", "today", "all", "@send <numbers>"
        const isCampaignDiscoveryIntent =
          isAdmin && (
            lowerText.startsWith('@send') ||
            lowerText.startsWith('send ') ||
            lowerText.startsWith('@campaign') ||
            lowerText.startsWith('campaign ') ||
            lowerText === '@send' ||
            lowerText === 'send' ||
            /^(?:@?send\s+)?(?:\d+\s*(?:hours?|hrs?|h|days?|d|weeks?|w)|today|all)$/i.test(trimmedText)
          );

        if (isCampaignDiscoveryIntent) {
          let rawArg = trimmedText.replace(/^@?(?:send_force|send|campaign)\s*/i, '').trim();
          if (!rawArg) rawArg = '24 hour';
          const phoneMatches = rawArg.match(/\b(?:\+?91)?[6-9]\d{9}\b/g) || [];

          if (phoneMatches.length > 0) {
            // Explicit numbers entered! Stage them directly into campaign review card
            const uniqueNumbers = [...new Set(phoneMatches.map((n) => n.replace(/[^0-9]/g, '').slice(-10)))];
            const recipients = uniqueNumbers.map((p) => ({
              phone: p,
              jid: `91${p}@s.whatsapp.net`,
              name: getStudentNameByPhone(p),
              lastActive: new Date().toISOString(),
            }));

            const campaign = {
              timeframeLabel: 'Manual Input List',
              hours: 0,
              recipients,
              isAwaitingRemoval: false,
              timestamp: Date.now(),
            };
            saveCampaignState(campaign);

            await sendCampaignReviewCard({ sock, adminJid: adminReplyJid, campaign });
            continue;
          }

          // Otherwise, it is an automated timeframe scan (e.g. "@send 24 hour", "send 24 hour", "24 hour", "12h", "7d", "today", "all")
          const tf = parseTimeframeHours(rawArg);
          const activeStudents = await getActiveStudentsInTimeframe(tf.hours, sock);

          if (activeStudents.length === 0) {
            await sock.sendMessage(adminReplyJid, {
              text:
                `⚠️ *No contacts found who messaged this bot in the past ${tf.label}.*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `None of the contacts who messaged recently were within the last ${tf.label}.\n\n` +
                `💡 *What you can do:*\n` +
                `• Expand search window: reply \`@send 7d\` or \`@send all\`\n` +
                `• Or target specific phone numbers directly:\n` +
                `  \`@send 9863013886, 9362980761\``,
            });
            continue;
          }

          const campaign = {
            timeframeLabel: tf.label,
            hours: tf.hours,
            recipients: activeStudents,
            isAwaitingRemoval: false,
            timestamp: Date.now(),
          };
          saveCampaignState(campaign);

          await sendCampaignReviewCard({ sock, adminJid: adminReplyJid, campaign });
          continue;
        }

        // Student & Confidential Dossier Commands (@student, @find student, student, phone, dossier, quota, buttons, Razorpay)
        const isStudentExplicit =
          buttonId?.startsWith('view_student_') ||
          buttonId?.startsWith('unlock_') ||
          buttonId?.startsWith('search_ex_') ||
          buttonId?.startsWith('btn_pay_') ||
          buttonId?.startsWith('btn_paywall_') ||
          buttonId === 'btn_flow_student' ||
          buttonId === 'info_limit_policy' ||
          /^[@!#]?(student|phone|dossier|quota|credits|unlock|lock|revokepass|ban|unban|viplist|vip|find\s+student|search\s+student)/i.test(rawText.trim()) ||
          rawText.trim().toLowerCase() === 'student' ||
          rawText.trim().toLowerCase() === 'directory' ||
          rawText.trim().toLowerCase() === 'why limit' ||
          rawText.trim().toLowerCase() === 'limit policy' ||
          rawText.trim().toLowerCase() === 'my credits';

        const isStudentMenuChoice =
          (!session || session.stage === 'COMPLETED') &&
          (rawText.trim().toLowerCase() === '2');

        const isUnlockOrPay =
          rawText.trim().toLowerCase() === 'unlock' ||
          rawText.trim().toLowerCase() === 'pay 5' ||
          rawText.trim().toLowerCase() === 'supporter' ||
          ((!session || session.stage === 'COMPLETED') && (
            rawText.trim().toLowerCase() === '5' ||
            rawText.trim().toLowerCase() === '49' ||
            rawText.trim().toLowerCase() === '3' ||
            rawText.trim().toLowerCase() === '119'
          ));

        // Cinderac Auth Command Guard
        const isLoginCommand = /^(?:login|logout|@cinderac|cinderac)\b/i.test(trimmedText);

        // Natural Student Search Triggers ("search for student", "find student", "who is student", "who is ...", student rolls)
        const isNaturalStudentQuery = !isGroup && !isLoginCommand && (
          /^[@!#]?(?:search\s+for\s+student|find\s+student|student\s+search|search\s+student|who\s+is\s+student|student\s+named)\b/i.test(trimmedText) ||
          /(?:\b|\/)([0-9]{2,3}[\/_][0-9]{2,4})\b/i.test(trimmedText) ||
          /\b([A-Za-z]\/[0-9]{2}\/[A-Za-z]{2}\/[0-9]{2,4})\b/i.test(trimmedText) ||
          (/^who\s+is\s+[a-zA-Z\s]{2,30}$/i.test(trimmedText) && !/\b(hod|dean|director|registrar|faculty|prof|dr)\b/i.test(trimmedText))
        );

        const isStudentTrigger = !isLoginCommand && (isStudentExplicit || isNaturalStudentQuery || isStudentMenuChoice || isUnlockOrPay);

        // Server Admin Controls (#status, #wifilogin, #wifi, #shutdown, #cancelshutdown, #update, admin buttons)
        if (isAdmin && !isGroup) {
          const adminHandled = await handleServerAdminCommand({
            sock,
            senderJid: adminReplyJid,
            rawBody: trimmedText,
            lowerBody: lowerText,
            buttonId,
            sendInteractiveButtons,
            getSearchCount: getFacultySearchCount,
            logFn: appendBotLog,
          });
          if (adminHandled) continue;
        }

        // Student & Confidential Dossier Commands (STRICTLY DM-only; disabled in groups)
        if (!isGroup && isStudentTrigger && (!session || session.stage === 'COMPLETED' || isStudentTrigger)) {
          try {
            const resolvedUserPhone = await resolveUserPhone(sock, senderJid);
            const handled = await handleStudentMessage({
              sock,
              getSock: () => activeBotSock,
              msg,
              rawBody: rawText,
              lowerBody: rawText.toLowerCase().trim(),
              buttonId,
              senderJid,
              sendInteractiveButtons,
              razorpay,
              userPhone: resolvedUserPhone,
            });
            if (handled) return;
          } catch (e) {
            console.error('[Student Module] Error handling student query:', e);
          }
        }

        // Faculty Search (@find / !find / view_faculty_ disambiguation buttons) & Help (@help / !help) - works in BOTH DMs and Groups
        const facultyHandled = await handleFacultyMessage({
          sock,
          senderJid,
          rawBody: trimmedText,
          lowerBody: lowerText,
          buttonId,
          sendInteractiveButtons,
          isAdmin,
          isGroup,
          rawMessage: msg,
          logFn: appendBotLog,
        });
        if (facultyHandled) continue;

        // Group Conversational AI (@ai <question>)
        if (isGroup) {
          if (isGroupAiTrigger) {
            const aiGroupHandled = await handleAIChatMessage({
              sock,
              senderJid,
              text: rawGroupText,
              senderName,
              isGroup: true,
              rawMessage: msg,
              logFn: appendBotLog,
              sendButtonsFn: sendInteractiveButtons,
            });
            if (aiGroupHandled) continue;
          }
          // Hard guard: never run printing/media/greeting flows inside groups
          continue;
        }

        // ======================================================================
        // 1. INCOMING FILE (PDF / IMAGE / DOCUMENT) - UNWRAPPED & NON-BLOCKING
        // ======================================================================
        const extracted = extractMediaFromMessage(content) || extractMediaFromMessage(msg.message);

        if (extracted) {
          handleIncomingMediaAttachment({
            msg,
            sock,
            senderJid,
            normalizedJid,
            senderName,
            extracted,
          });
          continue;
        }

        // ======================================================================
        // 2. BUTTON CLICKS & THEMATIC SHOWCASE SELECTION PROCESSING
        // ======================================================================
        // Top priority: If user has an active Cinderac session and replies with course selection (e.g. "6", "course 6", "6th")
        if (!buttonId) {
          const uPhone = await resolveUserPhone(sock, senderJid);
          const cSess = getCinderacSession(senderJid, uPhone);
          const activeStudio = userLastOpenedStudio.get(senderJid) || (normalizedJid && userLastOpenedStudio.get(normalizedJid));

          const hasPendingDisambig = pendingDisambiguations.has(senderJid) || (normalizedJid && pendingDisambiguations.has(normalizedJid));
          const isExplicitCoursePhrase = /\b(?:course|subject|cover)\s+(?:[1-9]|1\d|20)\b/i.test(clean);
          if (!hasPendingDisambig && cSess && cSess.courses && cSess.courses.length > 0 && (activeStudio === 'cinderac_cover' || isExplicitCoursePhrase)) {
            const matchedIdx = matchCinderacCourseSelection(clean, cSess.courses);
            if (matchedIdx !== -1) {
              buttonId = `btn_cind_course_${matchedIdx + 1}`;
              userLastOpenedStudio.set(senderJid, 'cinderac_cover');
              if (normalizedJid) userLastOpenedStudio.set(normalizedJid, 'cinderac_cover');
            }
          }
        }

        if (!buttonId && (!session || session.stage === 'COMPLETED')) {
          // A. If user has a pending student disambiguation, route typed input (1..4, roll, or name) directly to AI disambiguation
          if (pendingDisambiguations.has(senderJid) || (normalizedJid && pendingDisambiguations.has(normalizedJid))) {
            const userActivityPhone = await resolveUserPhone(sock, senderJid);
            const aiHandled = await handleAIChatMessage({
              sock,
              senderJid,
              normalizedJid,
              text: textMsg || clean,
              senderName,
              isGroup: false,
              rawMessage: msg,
              logFn: appendBotLog,
              sendButtonsFn: sendInteractiveButtons,
              userPhone: userActivityPhone,
            });
            if (aiHandled) continue;
          }

          const activeStudio = userLastOpenedStudio.get(senderJid) || (normalizedJid && userLastOpenedStudio.get(normalizedJid));

          if (!buttonId && activeStudio && (clean === '1' || clean === '2' || clean === '3' || clean === '4')) {
            if (activeStudio === 'cover_auth') {
              if (clean === '1') buttonId = 'btn_cinderac_chat_info';
              else if (clean === '2') buttonId = 'btn_cinderac_manual_presets';
            } else if (activeStudio === 'agent_hub') {
              if (clean === '1') buttonId = 'btn_flow_cover';
              else if (clean === '2') buttonId = 'btn_flow_application';
              else if (clean === '3') buttonId = 'btn_flow_game';
              else if (clean === '4') buttonId = 'btn_flow_student';
            } else if (activeStudio === 'cover') {
              buttonId = `btn_ex_cover_${clean}`;
            } else if (activeStudio === 'game') {
              buttonId = `btn_ex_game_${clean}`;
            } else if (activeStudio === 'app') {
              buttonId = `btn_ex_app_${clean}`;
            }
            userLastOpenedStudio.delete(senderJid);
            if (normalizedJid) userLastOpenedStudio.delete(normalizedJid);
          }
        }

        if (buttonId) {
          if (buttonId.startsWith('btn_disambig_') || buttonId.startsWith('btn_name_intent_')) {
            const userActivityPhone = await resolveUserPhone(sock, senderJid);
            const aiHandled = await handleAIChatMessage({
              sock,
              senderJid,
              normalizedJid,
              text: buttonId,
              senderName,
              isGroup: false,
              rawMessage: msg,
              logFn: appendBotLog,
              sendButtonsFn: sendInteractiveButtons,
              userPhone: userActivityPhone,
            });
            if (aiHandled) continue;
          }
          if (buttonId === 'btn_campaign_send') {
            const campaign = adminCampaignState.get(senderJid) || adminCampaignState.get(normalizedJid);
            if (!campaign) {
              await sock.sendMessage(senderJid, { text: `ℹ️ No active campaign found. Type *@send 24 hour* to start one.` });
              continue;
            }
            adminCampaignState.delete(senderJid);
            adminCampaignState.delete(normalizedJid);
            await executeCampaignBroadcast({ sock, adminJid: senderJid, campaign });
            continue;
          }

          if (buttonId === 'btn_campaign_remove_prompt') {
            const campaign = adminCampaignState.get(senderJid) || adminCampaignState.get(normalizedJid);
            if (!campaign) {
              await sock.sendMessage(senderJid, { text: `ℹ️ No active campaign found. Type *@send 24 hour* to start one.` });
              continue;
            }
            campaign.isAwaitingRemoval = true;
            await sock.sendMessage(senderJid, {
              text:
                `❌ *Remove Numbers from Audience*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Reply with the list item number(s) or phone number(s) to exclude.\n\n` +
                `• *By Number:* reply \`2\` or \`1, 3\`\n` +
                `• *By Phone:* reply \`+91 9233052856\`\n\n` +
                `_Or reply *cancel* to return to the audience review card._`,
            });
            continue;
          }

          if (buttonId === 'btn_campaign_cancel') {
            adminCampaignState.delete(senderJid);
            adminCampaignState.delete(normalizedJid);
            await sock.sendMessage(senderJid, {
              text: `🚫 *Campaign Broadcast Cancelled.*\nNo promotional messages were dispatched. Active list cleared.`,
            });
            continue;
          }

          if (buttonId === 'btn_campaign_cancel_remove') {
            const campaign = adminCampaignState.get(senderJid) || adminCampaignState.get(normalizedJid);
            if (campaign) {
              campaign.isAwaitingRemoval = false;
              await sendCampaignReviewCard({ sock, adminJid: senderJid, campaign });
            }
            continue;
          }

          if (buttonId === 'btn_flow_student') {
            const resolvedUserPhone = await resolveUserPhone(sock, senderJid);
            await handleStudentMessage({
              sock,
              getSock: () => activeBotSock,
              msg,
              rawBody: '',
              lowerBody: '',
              buttonId: 'btn_flow_student',
              senderJid,
              sendInteractiveButtons,
              razorpay,
              userPhone: resolvedUserPhone,
            });
            continue;
          }
          if (buttonId === 'btn_flow_agent' || buttonId === 'btn_paywall_chat_agent') {
            userLastOpenedStudio.set(senderJid, 'agent_hub');
            if (normalizedJid) userLastOpenedStudio.set(normalizedJid, 'agent_hub');
            const hr = new Date().getHours();
            const timeGreeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
            const cleanName = (senderName && /^[a-zA-Z\s]{2,25}$/.test(senderName.trim())) ? `, ${senderName.trim()}` : '';
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: 'Agent Kurox · Campus AI Companion',
              body:
                `*${timeGreeting}${cleanName}!* ☀️\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `I am *Agent Kurox*, your advanced AI assistant and campus companion at NERIST.\n\n` +
                `You can consult me on engineering derivations, mathematical solutions, programming, campus procedures, and academic drafting.\n\n` +
                `*Quick Studio Options:*\n\n` +
                `1. 📄 *Assignment Front Cover* — 1-Click official NERIST front covers\n` +
                `2. 📝 *Academic Application* — Formal leave, medical, or NOC requests\n` +
                `3. 🎮 *Offline Mini-Games & Tools* — Playable browser tools (Snake, Ludo, Calculators)\n` +
                `4. 🔍 *Campus Directory* — Search students and faculty records\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `🎓 *Cinderac & SymphonyX Campus Integration:*\n` +
                `Reply \`login <RegId> <Password>\` to check your live attendance & bunk limits, semester SGPA/CGPA trend graph, or download official admit cards!\n` +
                `_(Creating covers & applications is 100% free and never requires login)_\n\n` +
                `_Tap an action below, reply with a number (1-4), or type any question:_`,
              footer: 'Agent Kurox · Campus AI Companion',
              buttons: [
                { id: 'btn_flow_cover', text: '📄 Assignment Front Cover' },
                { id: 'btn_flow_application', text: '📝 Academic Application' },
                { id: 'btn_flow_game', text: '🎮 Offline Mini-Game' },
                { id: 'btn_flow_student', text: '🔍 Directory Search' },
              ],
            });
            continue;
          }
          if (buttonId === 'btn_flow_faculty') {
            const facultyGuide =
              '👨‍🏫 *NERIST Faculty Directory Search*\n' +
              '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
              'Search 350+ faculty profiles, phone numbers & departments instantly:\n\n' +
              '🔍 *Quick Search Examples:*\n' +
              '• *By Initials:* `@find akr` or `@find jb`\n' +
              '• *By Name:* `@find Rajesh Kumar` or `@find Ashok`\n' +
              '• *By Email Handle:* `@find kry`\n' +
              '• *By Department:* `@find CSE` or `@find Chemistry`\n\n' +
              '_Works both here in DM and in WhatsApp groups!_';
            await sock.sendMessage(senderJid, { text: facultyGuide });
            continue;
          }
          if (buttonId === 'btn_flow_printing') {
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '🖨️ Campus Printing Services',
              body: `Choose how you would like to print your documents:`,
              footer: 'PrintKurox · Hostel Block B Kiosk',
              buttons: [
                { text: '🌐 Print via Website', url: `${PUBLIC_KIOSK_URL}/` },
                { id: 'btn_print_via_whatsapp', text: '📱 Print via WhatsApp' },
              ],
            });
            continue;
          }

          if (buttonId === 'btn_print_via_whatsapp') {
            const waGuide =
              `📱 *How to Print via WhatsApp*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `1️⃣ *Send your files:* Forward or attach your PDF, Word doc, or photo directly here.\n\n` +
              `2️⃣ *Look for the reaction emoji:*\n` +
              `   • 📄 / 🖼️ reaction = File successfully received and queued.\n` +
              `   • ⚠️ *No reaction emoji?* WhatsApp dropped the upload packet over mobile network. Please send that file again!\n\n` +
              `3️⃣ *Multiple files:* Send all your files one by one. I will bundle them together under 1 single pickup code.\n\n` +
              `4️⃣ *Proceed:* Tap *Proceed to Print* when all your files are sent!\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `📍 *Kiosk Station:* ${STATION_NAME} (${STATION_ROOM})\n` +
              `⚡ *Rates:* B&W ₹3–4/p · Color ₹5–7/p\n\n` +
              `_Send your document or photo here now to get started!_`;
            await sock.sendMessage(senderJid, { text: waGuide });
            continue;
          }

          // --- AI APPLICATION / GAME DRAFT CONFIRMATION BUTTONS ---
          if (buttonId === 'btn_draft_pdf') {
            await handleGenerateApplicationPdfAction({ sock, senderJid, normalizedJid, senderName });
            continue;
          }
          if (buttonId === 'btn_draft_docx') {
            await handleGenerateApplicationDocxAction({ sock, senderJid, normalizedJid, senderName });
            continue;
          }
          if (buttonId === 'btn_cover_pdf') {
            await handleGenerateAssignmentCoverPdfAction({ sock, senderJid, normalizedJid, senderName });
            continue;
          }
          if (buttonId === 'btn_cover_docx') {
            await handleGenerateAssignmentCoverDocxAction({ sock, senderJid, normalizedJid, senderName });
            continue;
          }
          if (buttonId === 'btn_cover_edit') {
            await sock.sendMessage(senderJid, {
              text: `✏️ *Edit Assignment Cover Details*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nReply with your updated details (Subject Name, Code, Assignment Number, or Teacher Name), and I will generate the revised cover!`
            });
            continue;
          }
          if (buttonId.startsWith('btn_cind_course_')) {
            const courseIdx = parseInt(buttonId.replace('btn_cind_course_', ''), 10) - 1;
            const userPhone = await resolveUserPhone(sock, senderJid);
            await handleGenerateCinderacCoverAction({
              sock,
              senderJid,
              normalizedJid,
              senderName,
              userPhone,
              courseIndex: courseIdx
            });
            continue;
          }

          if (buttonId === 'btn_cinderac_web_link') {
            const userPhone = await resolveUserPhone(sock, senderJid);
            const token = createAuthToken(userPhone, senderJid);
            const base = getPublicAuthUrl();
            const hasValidTunnel = base && !base.includes('localhost') && !base.includes('api.trycloudflare.com');

            let msg = `🔐 *Cinderac Portal Verification*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (hasValidTunnel) {
              msg += `👉 *Tap to log in securely via Browser:*\n${base}/auth?t=${token}\n\n⏱️ _Expires in 10 minutes · Single-Use Cryptographic Token_\n\n`;
            } else {
              msg += `⚡ *Fastest Method (Direct in Chat):*\nReply directly to this chat with:\n\`login <RegId> <Password>\`\n\n💡 _Example:_\n\`login 121/016 Password123\`\n\n`;
            }
            msg += `_Your credentials are verified directly with Cinderac over SSL and never saved._`;

            await sock.sendMessage(senderJid, { text: msg });
            continue;
          }

          if (buttonId === 'btn_cinderac_chat_info') {
            await sock.sendMessage(senderJid, {
              text:
                `💬 *In-Chat Cinderac Authentication*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Reply directly to this chat with:\n` +
                `\`login <RegId> <Password>\`\n\n` +
                `💡 *Example:*\n` +
                `\`login 121/016 Password123\`\n\n` +
                `🔒 _Your credentials are validated over SSL directly with Cinderac and never saved on disk._`
            });
            continue;
          }

          if (buttonId === 'btn_cinderac_manual_presets') {
            userLastOpenedStudio.set(senderJid, 'cover');
            if (normalizedJid) userLastOpenedStudio.set(normalizedJid, 'cover');
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '📄 Assignment Front Cover (Manual)',
              body:
                `Choose one of the prefilled working showcases below to generate immediately, or reply with your own details:\n\n` +
                `*1️⃣ Civil Engineering (Structural Dynamics)*\n` +
                `• *Subject:* CE24016 STRUCTURAL DYNAMICS\n` +
                `• *Student:* ANIRBAN ROY (D/23/CE/035) · B.Tech 4th Year\n` +
                `• *Submitted To:* DR. TORI BASAR (Assistant Professor)\n\n` +
                `*2️⃣ Electronics & Communication (DSP)*\n` +
                `• *Subject:* EC31001 DIGITAL SIGNAL PROCESSING\n` +
                `• *Student:* RICHARD KONSAM (D/23/EC/002) · B.Tech 4th Year\n` +
                `• *Submitted To:* DR. JOYATRI BORA HAZARIKA (Assoc. Prof & HOD)\n\n` +
                `*3️⃣ Computer Science (Data Structures)*\n` +
                `• *Subject:* CS21001 DATA STRUCTURES & ALGORITHMS\n` +
                `• *Student:* ANKAN DAS (D/22/CS/014) · B.Tech 4th Year\n` +
                `• *Submitted To:* DR. MD. ANWAR HUSSAIN (Prof & Dean Academic)\n\n` +
                `_Tap an option below to generate immediately:_`,
              footer: 'Official NERIST Template · Red Crest',
              buttons: [
                { id: 'btn_ex_cover_1', text: '📄 1. Civil: CE24016' },
                { id: 'btn_ex_cover_2', text: '📄 2. ECE: EC31001' },
                { id: 'btn_ex_cover_3', text: '📄 3. CSE: CS21001' },
              ],
            });
            continue;
          }

          if (buttonId === 'btn_flow_cover') {
            const userPhone = await resolveUserPhone(sock, senderJid);
            const cinderacSession = getCinderacSession(senderJid, userPhone);

            if (cinderacSession && cinderacSession.courses && cinderacSession.courses.length > 0) {
              userLastOpenedStudio.set(senderJid, 'cinderac_cover');
              if (normalizedJid) userLastOpenedStudio.set(normalizedJid, 'cinderac_cover');
              const prof = cinderacSession.profile || {};
              const courses = cinderacSession.courses || [];
              let listText = '';
              courses.forEach((c, idx) => {
                listText += `${idx + 1}️⃣ *${c.code}* · ${c.name}\n   👨‍🏫 Faculty: ${c.faculty}\n`;
              });

              const body =
                `🎓 *Cinderac Verified Student: ${prof.fullName || 'Student'}*\n` +
                `🔢 *Roll Number:* ${prof.rollNo || ''}\n` +
                `🆔 *Registration Number:* ${prof.regId || ''}\n` +
                `🏛️ *Department:* ${prof.departmentName || ''}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📚 *Select your enrolled subject for 1-Click Cover (${courses.length} Courses):*\n` +
                listText +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `_Tap a subject below or reply with a course number (1-${courses.length}) or course code to generate your official front cover!_`;

              const buttons = [];
              if (courses[0]) buttons.push({ id: 'btn_cind_course_1', text: `📄 1. ${courses[0].code}` });
              if (courses[1]) buttons.push({ id: 'btn_cind_course_2', text: `📄 2. ${courses[1].code}` });
              if (courses[2]) buttons.push({ id: 'btn_cind_course_3', text: `📄 3. ${courses[2].code}` });

              await sendInteractiveButtons({
                sock,
                jid: senderJid,
                title: '📄 Assignment Front Cover Studio',
                body,
                footer: '1-Click Cinderac Sync · Agent Kurox',
                buttons
              });
              continue;
            }

            // Not yet synced with Cinderac
            userLastOpenedStudio.set(senderJid, 'cover_auth');
            if (normalizedJid) userLastOpenedStudio.set(normalizedJid, 'cover_auth');
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '📄 Assignment Front Cover Studio',
              body:
                `✨ *Create Official Assignment Cover*\n` +
                `You can create your cover *freely and instantly* right now! Choose a manual preset below or tell me your subject in chat.\n\n` +
                `⚡ *Optional Superpower — Cinderac Sync:*\n` +
                `Want all your registered subjects & faculty loaded in 1-tap?\n` +
                `Simply reply: \`login <RegId> <Password>\`\n\n` +
                `💡 _Example:_\n` +
                `\`login 121/016 Password123\`\n\n` +
                `_Credentials are verified directly with Cinderac over SSL and are never stored._`,
              footer: 'Official NERIST Template · Red Crest',
              buttons: [
                { id: 'btn_cinderac_manual_presets', text: '⚡ Manual Presets' },
                { id: 'btn_cinderac_chat_info', text: '💬 Login Instructions' },
              ],
            });
            continue;
          }

          if (buttonId === 'btn_flow_application') {
            userLastOpenedStudio.set(senderJid, 'app');
            if (normalizedJid) userLastOpenedStudio.set(normalizedJid, 'app');
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '📝 Academic Application Studio',
              body:
                `Choose one of the prefilled formal letter templates below to generate immediately, or reply with your custom details:\n\n` +
                `*1️⃣ Hostel Leave / Night-out Permission*\n` +
                `• *To:* The Warden, Hostel Block B, NERIST\n` +
                `• *Purpose:* 3-day home leave with travel & emergency contact details\n\n` +
                `*2️⃣ Medical Leave & Attendance Exemption*\n` +
                `• *To:* Dr. Joyatri Bora Hazarika, HOD (ECE), NERIST\n` +
                `• *Purpose:* 4-day medical leave with doctor prescription reference\n\n` +
                `*3️⃣ Bonafide / NOC Certificate Request*\n` +
                `• *To:* The Registrar / Dean (Academic), NERIST\n` +
                `• *Purpose:* Formal certificate issuance for passport / scholarship\n\n` +
                `_Tap an option below to generate immediately:_`,
              footer: 'Formal Academic Format · Zero Filler',
              buttons: [
                { id: 'btn_ex_app_1', text: '📝 1. Hostel Leave' },
                { id: 'btn_ex_app_2', text: '🏥 2. Medical Leave' },
                { id: 'btn_ex_app_3', text: '📜 3. Bonafide / NOC' },
              ],
            });
            continue;
          }

          if (buttonId === 'btn_flow_game') {
            userLastOpenedStudio.set(senderJid, 'game');
            if (normalizedJid) userLastOpenedStudio.set(normalizedJid, 'game');
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '🎮 Playable Offline Game Studio',
              body:
                `Choose one of the working prefilled games below to download and play directly in your mobile browser with zero internet:\n\n` +
                `*1️⃣ Classic Retro Arcade Snake*\n` +
                `• Smooth touch D-Pad & keyboard controls, animated apple food, speed scaling, and live high-score tracker.\n\n` +
                `*2️⃣ Interactive Multiplayer Ludo Board*\n` +
                `• 2 to 4 player offline board with 3D animated dice rolling, authentic home paths, turn indicators, and token capturing.\n\n` +
                `*3️⃣ Neon Tic-Tac-Toe vs Minimax AI*\n` +
                `• Smart unbeatable AI opponent, neon cyber theme, win-streak tracker, and instant replay.\n\n` +
                `_Tap an option below to generate immediately:_`,
              footer: 'Single-File HTML5 · Offline Playable',
              buttons: [
                { id: 'btn_ex_game_1', text: '🐍 1. Classic Snake' },
                { id: 'btn_ex_game_2', text: '🎲 2. Offline Ludo' },
                { id: 'btn_ex_game_3', text: '❌ 3. Tic-Tac-Toe AI' },
              ],
            });
            continue;
          }

          if (buttonId === 'btn_flow_attendance') {
            const userPhone = await resolveUserPhone(sock, senderJid);
            await handleAIChatMessage({
              sock,
              senderJid,
              normalizedJid,
              text: 'check my attendance',
              senderName,
              sendButtonsFn: sendInteractiveButtons,
              userPhone
            });
            continue;
          }

          if (buttonId === 'btn_flow_results') {
            const userPhone = await resolveUserPhone(sock, senderJid);
            await handleAIChatMessage({
              sock,
              senderJid,
              normalizedJid,
              text: 'show my exam results and graph',
              senderName,
              sendButtonsFn: sendInteractiveButtons,
              userPhone
            });
            continue;
          }

          if (buttonId === 'btn_flow_birthdays') {
            const userPhone = await resolveUserPhone(sock, senderJid);
            await handleAIChatMessage({
              sock,
              senderJid,
              normalizedJid,
              text: 'who has birthday today',
              senderName,
              sendButtonsFn: sendInteractiveButtons,
              userPhone
            });
            continue;
          }

          if (buttonId === 'btn_flow_admit_card') {
            const userPhone = await resolveUserPhone(sock, senderJid);
            await handleAIChatMessage({
              sock,
              senderJid,
              normalizedJid,
              text: 'download my admit card',
              senderName,
              sendButtonsFn: sendInteractiveButtons,
              userPhone
            });
            continue;
          }

          // --- PREFILLED SHOWCASE OPTION TRIGGERS ---
          if (buttonId === 'btn_ex_cover_1' || buttonId === 'btn_ex_cover_2' || buttonId === 'btn_ex_cover_3') {
            const userPhone = await resolveUserPhone(sock, senderJid);
            let coverObj;
            if (buttonId === 'btn_ex_cover_1') {
              coverObj = {
                subjectName: 'STRUCTURAL DYNAMICS',
                subjectCode: 'CE24016',
                assignmentTitle: 'ASSIGNMENT',
                studentName: 'ANIRBAN ROY',
                rollNo: 'D/23/CE/035',
                yearSemester: 'B.Tech 4th Year',
                teacherName: 'DR. TORI BASAR',
                teacherDesignation: 'Assistant Professor',
                department: 'CIVIL ENGINEERING',
                timestamp: Date.now(),
              };
            } else if (buttonId === 'btn_ex_cover_2') {
              coverObj = {
                subjectName: 'DIGITAL SIGNAL PROCESSING',
                subjectCode: 'EC31001',
                assignmentTitle: 'ASSIGNMENT',
                studentName: 'RICHARD KONSAM',
                rollNo: 'D/23/EC/002',
                yearSemester: 'B.Tech 4th Year',
                teacherName: 'DR. JOYATRI BORA HAZARIKA',
                teacherDesignation: 'Associate Professor & HOD',
                department: 'ELECTRONICS AND COMMUNICATION ENGINEERING',
                timestamp: Date.now(),
              };
            } else {
              coverObj = {
                subjectName: 'DATA STRUCTURES & ALGORITHMS',
                subjectCode: 'CS21001',
                assignmentTitle: 'ASSIGNMENT',
                studentName: 'ANKAN DAS',
                rollNo: 'D/22/CS/014',
                yearSemester: 'B.Tech 4th Year',
                teacherName: 'DR. MD. ANWAR HUSSAIN',
                teacherDesignation: 'Professor & Dean Academic',
                department: 'COMPUTER SCIENCE AND ENGINEERING',
                timestamp: Date.now(),
              };
            }
            saveCoverDraft(senderJid, normalizedJid, userPhone, coverObj);
            const cardMsg =
              `📄 *Official NERIST Assignment Front Cover Ready!*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `• *Assignment:* ${coverObj.assignmentTitle}\n` +
              `• *Subject:* ${coverObj.subjectCode}  ${coverObj.subjectName}\n` +
              `• *Submitted By:* ${coverObj.studentName} (${coverObj.rollNo}) · ${coverObj.yearSemester}\n` +
              `• *Submitted To:* ${coverObj.teacherName} (${coverObj.teacherDesignation})\n` +
              `• *Department:* DEPARTMENT OF ${coverObj.department}\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `✅ *Format Verified:* Official red NERIST crest, academic border & accreditation footer.\n\n` +
              `_Tap below to download your ready-to-print PDF or Word document:_`;

            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '📄 Assignment Front Cover Ready',
              body: cardMsg,
              footer: 'PrintKurox AutoPrint · Official Template',
              buttons: [
                { id: 'btn_cover_pdf', text: '📄 Download Cover PDF' },
                { id: 'btn_cover_docx', text: '📝 Download Cover DOCX' },
                { id: 'btn_cover_edit', text: '✏️ Edit Details' },
              ],
            });
            continue;
          }

          if (buttonId === 'btn_ex_game_1' || buttonId === 'btn_ex_game_2' || buttonId === 'btn_ex_game_3') {
            const userPhone = await resolveUserPhone(sock, senderJid);
            let gameType = 'snake';
            let gameTitle = 'Classic Retro Arcade Snake';
            if (buttonId === 'btn_ex_game_2') {
              gameType = 'ludo';
              gameTitle = 'Interactive Multiplayer Ludo Board';
            } else if (buttonId === 'btn_ex_game_3') {
              gameType = 'tictactoe';
              gameTitle = 'Neon Tic-Tac-Toe vs Minimax AI';
            }

            const generatedHtml = generateHtmlGame(gameType, { studentName: senderName || 'NERIST Student' });
            const gameObj = { gameType, htmlContent: generatedHtml, timestamp: Date.now() };
            activeGameDrafts.set(senderJid, gameObj);
            if (normalizedJid) activeGameDrafts.set(normalizedJid, gameObj);
            if (userPhone) activeGameDrafts.set(userPhone, gameObj);

            const cardMsg =
              `🎮 *${gameTitle} Generated!*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `• *Type:* Single-file offline HTML5 game\n` +
              `• *Instructions:* Tap *Download .HTML File* to save and play instantly in your mobile browser (Chrome/Safari), or copy the raw code!\n\n` +
              `_Zero internet connection required after downloading._`;

            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '🎮 Playable Web Game Ready',
              body: cardMsg,
              footer: 'PrintKurox Web Studio',
              buttons: [
                { id: 'btn_draft_html', text: '🌐 Download .HTML File' },
                { text: '📋 Copy HTML Code', copyCode: generatedHtml },
                { id: 'btn_flow_game', text: '🎮 Play Another Game' },
              ],
            });
            continue;
          }

          if (buttonId === 'btn_ex_app_1' || buttonId === 'btn_ex_app_2' || buttonId === 'btn_ex_app_3') {
            const userPhone = await resolveUserPhone(sock, senderJid);
            let letterText = '';
            const todayStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

            if (buttonId === 'btn_ex_app_1') {
              letterText =
`To,
The Warden,
Hostel Block B,
North Eastern Regional Institute of Science and Technology (NERIST),
Nirjuli, Arunachal Pradesh - 791109.

Date: ${todayStr}

Subject: Application for permission for 3 days hostel leave.

Respected Sir,

I am writing to formally request permission for a temporary leave of absence from the hostel for a period of three days, starting from tomorrow. I need to visit my hometown due to an urgent family commitment.

During my absence, I will ensure that my academic responsibilities remain unaffected. My emergency contact and travel details have been provided below for your reference.

I kindly request you to grant me leave for the mentioned duration.

Thanking you.

Yours obediently,
(Signature of Student)
Name: ${senderName || 'Student'}
Roll No: D/23/CE/035
Room No: Block B, Room 214
Contact: +91 ${userPhone || '9863013886'}`;
            } else if (buttonId === 'btn_ex_app_2') {
              letterText =
`To,
Dr. Joyatri Bora Hazarika,
Head of Department,
Department of Electronics and Communication Engineering,
North Eastern Regional Institute of Science and Technology (NERIST),
Nirjuli, Arunachal Pradesh - 791109.

Date: ${todayStr}

Subject: Application for leave of absence on medical grounds and attendance condonation.

Respected Madam,

I beg most respectfully to bring to your kind notice that I was diagnosed with severe viral fever and was advised strict bed rest by the medical officer from the campus health center for four days.

Consequently, I was unable to attend the scheduled theory lectures and laboratory sessions during this period. I have attached the official medical fitness prescription for your kind verification.

Therefore, I earnestly request you to kindly condone my absence and grant me leave for the aforementioned dates so that my academic attendance requirement is not adversely affected.

Thanking you.

Yours faithfully,
(Signature of Student)
Name: RICHARD KONSAM
Roll No: D/23/EC/002
Department: Electronics and Communication Engineering
Semester: 7th Semester (B.Tech 4th Year)`;
            } else {
              letterText =
`To,
The Registrar / Dean (Academic),
North Eastern Regional Institute of Science and Technology (NERIST),
Nirjuli, Arunachal Pradesh - 791109.

Date: ${todayStr}

Subject: Request for issuance of Bonafide Student Certificate.

Respected Sir,

I am a bonafide student of this institute, currently pursuing the Bachelor of Technology (B.Tech) program in the Department of Computer Science and Engineering, in the 4th Year (7th Semester).

I require an official Bonafide Student Certificate for the purpose of applying for an upcoming national internship program and passport renewal.

I kindly request your office to issue the Bonafide Certificate at your earliest convenience. My academic registration credentials are furnished below.

Thanking you.

Yours obediently,
(Signature of Student)
Name: ANKAN DAS
Roll No: D/22/CS/014
Registration No: 121/045
Department: Computer Science and Engineering`;
            }

            const draftObj = {
              draftText: letterText,
              text: letterText,
              studentName: senderName || 'NERIST Student',
              rollNo: '',
              timestamp: Date.now(),
            };
            activeDrafts.set(senderJid, draftObj);
            if (normalizedJid) activeDrafts.set(normalizedJid, draftObj);
            if (userPhone) activeDrafts.set(userPhone, draftObj);

            // Send pure letter directly in chat
            await sock.sendMessage(senderJid, { text: letterText });

            // Follow up with action buttons
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '📄 Academic Application Ready',
              body: 'Your formal application is ready. Choose an option below to copy or download:',
              footer: 'PrintKurox Academic Studio',
              buttons: [
                { text: '📋 Copy Letter', copyCode: letterText },
                { id: 'btn_draft_pdf', text: '📄 Generate Official PDF' },
                { id: 'btn_draft_docx', text: '📝 Generate Word DOCX' },
              ],
            });
            continue;
          }
          if (buttonId === 'btn_print_generated_doc') {
            await handlePrintGeneratedDocAction({ sock, senderJid, normalizedJid, senderName });
            continue;
          }
          if (buttonId === 'btn_draft_html') {
            await handleGenerateHtmlGameAction({ sock, senderJid, normalizedJid, senderName });
            continue;
          }
          if (buttonId === 'btn_draft_edit') {
            await sock.sendMessage(senderJid, {
              text: `✏️ *Edit Application Draft*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nSimply reply here with the details you'd like to adjust (e.g. dates, reason, or roll number)!\n\nI will update the draft for you.`
            });
            continue;
          }

          // Session Expiration Guard
          if (session && isSessionExpired(session) && session.stage !== 'COMPLETED') {
            userSessions.delete(senderJid);
            userSessions.delete(normalizedJid);
            await sendSessionExpiredMessage(sock, senderJid);
            continue;
          }

          // --- QUEUE STAGING BUTTON: ADD MORE FILES ---
          if (buttonId === 'btn_queue_add_more') {
            if (!session || !session.queuedFiles || session.queuedFiles.length === 0) {
              await sock.sendMessage(senderJid, {
                text: `📎 *Please forward or attach a PDF or photo to start!*`,
              });
              continue;
            }
            session.stage = 'AWAITING_MORE_FILES';
            session.timestamp = Date.now();
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: 'PrintKurox · Waiting for Files',
              body: `📥 *Send your additional documents or photos now!*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nCurrently queued: *${session.queuedFiles.length} file(s)*.\n\nSend more files here, or tap below when you are ready:`,
              footer: 'PrintKurox AutoPrint',
              buttons: [
                { id: 'btn_queue_continue', text: `✅ Proceed to Print (${session.queuedFiles.length} ${session.queuedFiles.length === 1 ? 'File' : 'Files'})` },
                { id: 'btn_queue_clear', text: '❌ Cancel Print' },
              ],
            });
            continue;
          }

          // --- QUEUE STAGING / CHANGE SETTINGS BUTTON: CONTINUE TO PRINT ---
          if (buttonId === 'btn_queue_continue') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              continue;
            }
            if (session.stage === 'CHANGE_SETTINGS_STAGING' && session.colorMode) {
              await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              continue;
            }
            await continueWithQueuedFiles({ sock, senderJid, session, senderName });
            continue;
          }

          // --- CHANGE SETTINGS / PROMO BUTTON: APPLY PROMO CODE ---
          if (buttonId === 'btn_queue_promo') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              continue;
            }
            if (session.promoApplied) {
              await sock.sendMessage(senderJid, {
                text:
                  `🎟️ *Promo Discount Already Active!*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Your promotional discount is already active on this order.\n\n` +
                  `⚡ *Active Rates:*\n` +
                  `• ⚫ B&W: *₹3.00/p* (<10 pgs) · *₹2.50/p* (10+ pgs)\n` +
                  `• 🎨 Color: *₹5.00/p* (<10 pgs) · *₹4.00/p* (10+ pgs)\n\n` +
                  `_Settings are preserved! Tap "Proceed to Print" to view your updated summary._`,
              });
              if (session.colorMode) {
                await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              } else {
                await sendChangeSettingsCard({ sock, senderJid, session });
              }
              continue;
            }

            session.prevStage = session.stage || 'CHANGE_SETTINGS_STAGING';
            session.stage = 'AWAITING_PROMO_CODE';
            await sock.sendMessage(senderJid, {
              text:
                `🎟️ *Enter Promo Code*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Please reply with your promo code to unlock exclusive student print tariffs for this order.\n\n` +
                `_Reply with your code or send *cancel* to return._`,
            });
            continue;
          }

          // --- QUEUE STAGING BUTTON: RESCAN RECENT FILES (LEGACY FALLBACK) ---
          if (buttonId === 'btn_queue_rescan') {
            await handleRescanRecentFiles({ sock, senderJid, normalizedJid, session, senderName });
            continue;
          }

          // --- QUEUE STAGING BUTTON: CLEAR QUEUE ---
          if (buttonId === 'btn_queue_clear') {
            purgeUserPrintSession(senderJid, normalizedJid);
            await sock.sendMessage(senderJid, {
              text:
                `🗑️ *Print Queue Cleared*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Your print queue has been emptied and all files cancelled.\n` +
                `Whenever you're ready, forward or send any document or photo to start fresh!`,
            });
            continue;
          }

          // --- STEP 1 BUTTON: COLOR SELECTION ---
          if (buttonId === 'btn_bw' || buttonId === 'btn_color') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              continue;
            }

            // AUTO-MERGE GUARD: If student has multiple files in queue and hasn't merged yet, merge now!
            if (session.queuedFiles && session.queuedFiles.length > 1 && !session.isMergedBatch) {
              console.log(`[WA-Bot] ⚡ Auto-merging ${session.queuedFiles.length} queued files upon color selection...`);
              await continueWithQueuedFiles({ sock, senderJid, session, senderName });
            }

            session.colorMode = buttonId === 'btn_color' ? 'color' : 'bw';
            session.timestamp = Date.now();
            console.log(`[WA-Bot] ${senderName} selected ${session.colorMode.toUpperCase()}`);

            // If document has multiple pages (>1), offer separate Page Selection.
            // If 1-page photo/document, automatically set All pages and advance to Copies!
            if (session.totalPages > 1) {
              await sendStep2PageButtons(sock, senderJid, session);
            } else {
              session.selectedPages = [1];
              session.pageRangeStr = 'All';
              await sendStep3CopiesButtons(sock, senderJid, session);
            }
            continue;
          }

          // --- STEP 2 BUTTON: PAGE SELECTION (ALL vs CUSTOM) ---
          if (buttonId === 'btn_pages_all') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              continue;
            }
            session.selectedPages = Array.from({ length: session.totalPages }, (_, i) => i + 1);
            session.pageRangeStr = 'All';
            session.timestamp = Date.now();
            console.log(`[WA-Bot] ${senderName} selected All Pages, advancing to Copies`);
            await sendStep3CopiesButtons(sock, senderJid, session);
            continue;
          }

          if (buttonId === 'btn_pages_custom') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              continue;
            }
            session.stage = 'AWAITING_CUSTOM_RANGE';
            session.timestamp = Date.now();
            await sock.sendMessage(senderJid, {
              text:
                `🔢 *Custom Page Range:*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Total pages in file: *${session.totalPages}*\n\n` +
                `Reply with the pages you want to print, e.g.:\n` +
                `• *1, 3* (or *1 and 3*)\n` +
                `• *1-${Math.min(3, session.totalPages)}* (a range of pages)\n` +
                `• *all* (to print all pages)\n` +
                `• *odd* or *even*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            });
            continue;
          }

          // --- STEP 3 BUTTON: COPIES SELECTION ---
          if (buttonId === 'btn_copies_custom') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              continue;
            }
            session.stage = 'AWAITING_CUSTOM_COPIES';
            session.timestamp = Date.now();
            await sock.sendMessage(senderJid, {
              text:
                `🔢 *Custom Number of Copies:*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `How many copies do you need?\n` +
                `Reply with any number from *1 to 50* (e.g. *3*, *5*, *10*):\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            });
            continue;
          }

          if (buttonId.startsWith('btn_copies_')) {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              continue;
            }
            const copies = parseInt(buttonId.replace('btn_copies_', ''), 10) || 1;
            session.copies = copies;
            if (!session.selectedPages) {
              session.selectedPages = Array.from({ length: session.totalPages }, (_, i) => i + 1);
              session.pageRangeStr = 'All';
            }
            // Natural orientation: automatically follows the uploaded file's geometry
            session.orientation = session.isLandscapeDefault ? 'landscape' : 'portrait';
            session.timestamp = Date.now();

            console.log(`[WA-Bot] ${senderName} selected ${copies} ${copies === 1 ? 'Copy' : 'Copies'}, advancing to Summary & 1-Tap UPI`);
            await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
            continue;
          }

          // --- BUTTON: VIEW PREVIEW ---
          if (buttonId === 'btn_view_preview') {
            await sendDocumentVisualPreview({ sock, senderJid, senderName, session });
            continue;
          }

          // --- BUTTON: PROCEED TO PAYMENT / PAY NOW ---
          if (buttonId === 'btn_pay_now' || buttonId === 'btn_proceed_payment') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              continue;
            }
            if (session.paymentLinkUrl) {
              await sock.sendMessage(senderJid, {
                text:
                  `💳 *PrintKurox Instant UPI Payment*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `📄 *File:* ${session.fileName}\n` +
                  `💰 *Amount Due:* *₹${session.totalPrice || 1}*\n` +
                  `📍 *Station:* ${session.station?.name || defaultStation.name}\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `👉 *Tap link to pay via GPay / PhonePe / Paytm / UPI:*\n` +
                  `🔗 ${session.paymentLinkUrl}\n\n` +
                  `🖨️ _Your document will print automatically once payment is received._\n` +
                  `_Code: ${session.pickupCode || 'Active'}_`,
              });
              continue;
            }
            console.log(`[WA-Bot] ${senderName} tapped pay now, re-dispatching 1-Tap UPI Card`);
            await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
            continue;
          }

          // --- RESET / CHANGE SETTINGS BUTTON ---
          if (buttonId === 'btn_reset') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              continue;
            }
            if (session.jobId && activePollers.has(session.jobId)) {
              clearInterval(activePollers.get(session.jobId));
              activePollers.delete(session.jobId);
            }
            // PRESERVE current print settings (colorMode, copies, selectedPages, orientation)
            session.stage = 'CHANGE_SETTINGS_STAGING';
            session.paymentLinkUrl = null;
            session.paymentLinkId = null;
            session.jobId = null;
            session.pickupCode = null;
            session.timestamp = Date.now();

            console.log(`[WA-Bot] ${senderName} tapped RESET / CHANGE. Showing Change Settings Card (Settings Preserved).`);
            await sendChangeSettingsCard({ sock, senderJid, session });
            continue;
          }

          // --- STEP 5 PAYMENT: CASH BUTTON ---
          if (buttonId === 'btn_pay_cash') {
            await handleCashOrder({ sock, senderJid, session });
            continue;
          }

          // --- STATION SELECTION BUTTON ---
          if (buttonId.startsWith('btn_station_')) {
            const stationKey = buttonId.replace('btn_station_', '');
            let chosen = AVAILABLE_STATIONS.find((s) => s.id === stationKey);
            if (chosen) {
              if (session) session.station = chosen;
              await sock.sendMessage(senderJid, {
                text: `✅ *Print Station Updated!*\n📍 *${chosen.name}* (${chosen.room})\n\nYour prints will be routed to this printer screen.`,
              });
              continue;
            }
          }
        }

        // ======================================================================
        // 3. INCOMING TEXT REPLY (TYPED FALLBACK / STATIONS / CASH / HELP)
        // ======================================================================
        const textMsg =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          content?.conversation ||
          content?.extendedTextMessage?.text ||
          buttonText ||
          rawGroupText ||
          '';

        if (textMsg && !isGroup) {
          clean = textMsg.trim().toLowerCase();

          // Session Expiration Guard for typed input
          if (session && isSessionExpired(session) && session.stage !== 'COMPLETED') {
            userSessions.delete(senderJid);
            userSessions.delete(normalizedJid);
            await sendSessionExpiredMessage(sock, senderJid);
            continue;
          }

          // --- UNIVERSAL CANCEL / STOP COMMAND ---
          if (/^(cancel|stop|abort|exit|quit|clear|end|cancel\s+order)$/i.test(clean)) {
            purgeUserPrintSession(senderJid, normalizedJid);
            await sock.sendMessage(senderJid, {
              text:
                `❌ *Print Order Cancelled*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Your active print session and queue have been cleared.\n` +
                `No payment has been charged.\n\n` +
                `_Whenever you're ready, simply send or forward a new document or photo to start fresh!_`,
            });
            continue;
          }

          // --- PROMO CODE ENTRY STAGE ---
          if (session && session.stage === 'AWAITING_PROMO_CODE') {
            const enteredCode = clean.trim().toUpperCase();
            if (clean === 'cancel' || clean === 'back' || clean === 'return' || clean === 'skip') {
              session.stage = session.prevStage || 'CHANGE_SETTINGS_STAGING';
              const returnToPayment = Boolean(session.colorMode);
              delete session.prevStage;
              await sock.sendMessage(senderJid, {
                text: '↩️ Promo code entry cancelled. Standard tariffs apply.',
              });
              if (returnToPayment) {
                await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              } else {
                await sendChangeSettingsCard({ sock, senderJid, session });
              }
              continue;
            }

            if (isValidPromoCode(enteredCode)) {
              session.promoApplied = true;
              session.promoCode = VALID_PROMO_CODE;
              session.stage = 'AWAITING_PAYMENT';
              delete session.prevStage;

              // Clear prior payment link so Razorpay / UPI link is regenerated with discounted total
              session.paymentLinkUrl = null;
              session.paymentLinkId = null;

              console.log(`[WA-Bot] 🎟️ Valid Promo Code applied for ${senderName} (${senderJid}) with preserved settings.`);
              await sock.sendMessage(senderJid, {
                text:
                  `🎉 *Promo Code Applied Successfully!*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Exclusive student promotional tariffs activated for this order:\n` +
                  `• ⚫ B&W: *₹3.00/p* (<10 pgs) · *₹2.50/p* (10+ pgs)\n` +
                  `• 🎨 Color: *₹5.00/p* (<10 pgs) · *₹4.00/p* (10+ pgs)\n\n` +
                  `_Your print settings (color mode & copies) are preserved! Here is your updated discount checkout:_`,
              });

              // Dispatch the edited discount order summary card with new price & UPI link!
              await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              continue;
            } else {
              session.stage = session.prevStage || 'CHANGE_SETTINGS_STAGING';
              delete session.prevStage;

              console.log(`[WA-Bot] ❌ Invalid promo code attempt "${clean}" by ${senderName} (${senderJid})`);
              await sock.sendMessage(senderJid, {
                text:
                  `❌ *Invalid Promo Code*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `The promo code you entered is not recognized or has expired.\n` +
                  `Standard tariffs will apply to your order.\n\n` +
                  `_Your previous settings are preserved._`,
              });

              if (session.colorMode) {
                await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              } else {
                await sendChangeSettingsCard({ sock, senderJid, session });
              }
              continue;
            }
          }

          // --- CHANGE SETTINGS INTERACTIVE TEXT REPLIES ---
          if (session && session.stage === 'CHANGE_SETTINGS_STAGING') {
            if (/^(bw|b&w|black|black\s*and\s*white|mono|monochrome)$/i.test(clean)) {
              session.colorMode = 'bw';
              session.paymentLinkUrl = null;
              session.paymentLinkId = null;
              await sock.sendMessage(senderJid, { text: '⚫ Print mode updated to *Black & White*.' });
              await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              continue;
            }
            if (/^(color|colour)$/i.test(clean)) {
              session.colorMode = 'color';
              session.paymentLinkUrl = null;
              session.paymentLinkId = null;
              await sock.sendMessage(senderJid, { text: '🎨 Print mode updated to *Color*.' });
              await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              continue;
            }
            const copyMatch = clean.match(/^(\d+)(?:\s*copies|\s*copy)?$/i);
            if (copyMatch) {
              const c = parseInt(copyMatch[1], 10);
              if (c >= 1 && c <= 50) {
                session.copies = c;
                session.paymentLinkUrl = null;
                session.paymentLinkId = null;
                await sock.sendMessage(senderJid, { text: `🔢 Copies updated to *${c}*.` });
                await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
                continue;
              }
            }
            if (/^(proceed|print|continue|pay|done|checkout)$/i.test(clean)) {
              await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              continue;
            }
          }

          // --- DIRECT PROMO CODE ENTRY AT ANY ACTIVE PRINT STAGE ---
          if (session && session.stage && session.stage !== 'COMPLETED' && isValidPromoCode(clean)) {
            if (session.promoApplied) {
              await sock.sendMessage(senderJid, {
                text:
                  `🎟️ *Promo Code Already Active!*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Your promotional discount is already active on this order.\n\n` +
                  `⚡ *Active Rates:*\n` +
                  `• ⚫ B&W: *₹3.00/p* (<10 pgs) · *₹2.50/p* (10+ pgs)\n` +
                  `• 🎨 Color: *₹5.00/p* (<10 pgs) · *₹4.00/p* (10+ pgs)\n\n` +
                  `_Discount is applied once per order._`,
              });
              continue;
            }

            session.promoApplied = true;
            session.promoCode = VALID_PROMO_CODE;
            session.paymentLinkUrl = null;
            session.paymentLinkId = null;

            console.log(`[WA-Bot] 🎟️ Direct Promo Code applied for ${senderName} (${senderJid}) at stage ${session.stage}`);
            await sock.sendMessage(senderJid, {
              text:
                `🎉 *Promo Code Applied Successfully!*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Exclusive student promotional tariffs activated for this order:\n` +
                `• ⚫ B&W: *₹3.00/p* (<10 pgs) · *₹2.50/p* (10+ pgs)\n` +
                `• 🎨 Color: *₹5.00/p* (<10 pgs) · *₹4.00/p* (10+ pgs)\n\n` +
                `_Discount active for this print order!_`,
            });

            if (session.stage === 'AWAITING_PAYMENT' || session.stage === 'AWAITING_SUMMARY_CONFIRMATION') {
              await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
            } else if (session.stage === 'QUEUE_STAGING') {
              await sendQueueStagingCard({ sock, senderJid, session });
            } else if (session.stage === 'AWAITING_COLOR_MODE') {
              await sendStep1Buttons(sock, senderJid, session.fileName, session.totalPages, session.fileSizeMb, session);
            }
            continue;
          }

          // --- TRIGGER PROMO CODE PROMPT VIA TEXT ---
          if (session && session.stage && session.stage !== 'COMPLETED' && /^(promo|promocode|promo\s*code|coupon|discount|apply\s*promo)$/i.test(clean)) {
            if (session.promoApplied) {
              await sock.sendMessage(senderJid, {
                text:
                  `🎟️ *Promo Code Already Active!*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Your promotional discount is already active on this order.\n\n` +
                  `⚡ *Active Rates:*\n` +
                  `• ⚫ B&W: *₹3.00/p* (<10 pgs) · *₹2.50/p* (10+ pgs)\n` +
                  `• 🎨 Color: *₹5.00/p* (<10 pgs) · *₹4.00/p* (10+ pgs)\n\n` +
                  `_Discount is applied once per order._`,
              });
              continue;
            }

            session.prevStage = session.stage;
            session.stage = 'AWAITING_PROMO_CODE';
            await sock.sendMessage(senderJid, {
              text:
                `🎟️ *Enter Promo Code*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Please reply with your promo code to unlock exclusive student print tariffs for this order.\n\n` +
                `_Reply with your code or send *cancel* to return._`,
            });
            continue;
          }

          // --- QUEUE ACTIONS: ADD MORE / CONTINUE / CLEAR / VIEW QUEUE ---
          if (session && (session.stage === 'QUEUE_STAGING' || session.stage === 'AWAITING_MORE_FILES')) {
            if (clean === 'more' || clean === 'add' || clean === 'add more' || clean === 'add pdf' || clean === 'add more pdf' || clean === 'upload' || clean === 'upload more' || clean === 'attach') {
              session.stage = 'AWAITING_MORE_FILES';
              session.timestamp = Date.now();
              await sock.sendMessage(senderJid, {
                text:
                  `📎 *Send your next file here!*\n` +
                  `I will add it to your queue (${session.queuedFiles?.length || 0} files currently).\n\n` +
                  `_Reply *continue* or *done* when you are finished!_`,
              });
              continue;
            }

            if (clean === 'continue' || clean === 'done' || clean === 'print' || clean === 'next' || clean === 'ok' || clean === 'proceed') {
              await continueWithQueuedFiles({ sock, senderJid, session, senderName });
              continue;
            }

            if (clean === 'clear' || clean === 'cancel' || clean === 'cancel queue' || clean === 'clear queue' || clean === 'empty' || clean === 'delete' || clean === 'stop' || clean === 'quit' || clean === 'exit') {
              purgeUserPrintSession(senderJid, normalizedJid);
              await sock.sendMessage(senderJid, {
                text: `🗑️ *Print queue cleared!* Forward or send a new document to start fresh.`,
              });
              continue;
            }

            if (clean === 'queue' || clean === 'files' || clean === 'list') {
              await sendQueueStagingCard({ sock, senderJid, session });
              continue;
            }

            if (clean === 'rescan' || clean === 'scan again' || clean === 'check files' || clean === 'recheck') {
              await handleRescanRecentFiles({ sock, senderJid, normalizedJid, session, senderName });
              continue;
            }
          }

          // --- TEXT CONFIRMATION FOR APPLICATION & COVER PDF GENERATION ---
          if (/(?:make|generate|create|save|download|send)\s+(?:it\s+into\s+a?\s*)?pdf\b/i.test(clean) || /^(?:make|generate|create|download|send)?\s*pdf$/i.test(clean)) {
            const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
            const hasCover = (norm && activeCoverDrafts.get(norm)) || (senderJid && activeCoverDrafts.get(senderJid));
            if (hasCover && /cover/i.test(clean)) {
              await handleGenerateAssignmentCoverPdfAction({ sock, senderJid, normalizedJid, senderName });
            } else if (hasCover && !activeDrafts.get(norm) && !activeDrafts.get(senderJid)) {
              await handleGenerateAssignmentCoverPdfAction({ sock, senderJid, normalizedJid, senderName });
            } else {
              await handleGenerateApplicationPdfAction({ sock, senderJid, normalizedJid, senderName });
            }
            continue;
          }

          // --- TEXT CONFIRMATION FOR DOCX GENERATION ---
          if (/(?:make|generate|create|save|download|send)\s+(?:it\s+into\s+a?\s*)?(?:docx|word)\b/i.test(clean) || /^(?:make|generate|create|download|send)?\s*(?:docx|word)$/i.test(clean)) {
            const norm = normalizedJid || (senderJid ? jidNormalizedUser(senderJid) : null);
            const hasCover = (norm && activeCoverDrafts.get(norm)) || (senderJid && activeCoverDrafts.get(senderJid));
            if (hasCover && /cover/i.test(clean)) {
              await handleGenerateAssignmentCoverDocxAction({ sock, senderJid, normalizedJid, senderName });
            } else if (hasCover && !activeDrafts.get(norm) && !activeDrafts.get(senderJid)) {
              await handleGenerateAssignmentCoverDocxAction({ sock, senderJid, normalizedJid, senderName });
            } else {
              await handleGenerateApplicationDocxAction({ sock, senderJid, normalizedJid, senderName });
            }
            continue;
          }

          if (/^(print\s+application|print\s+this\s+pdf|print\s+doc|print\s+draft|print\s+my\s+application)$/i.test(clean)) {
            await handlePrintGeneratedDocAction({ sock, senderJid, normalizedJid, senderName });
            continue;
          }

          // --- TEXT CONFIRMATION FOR HTML GAME / WEB TOOL ---
          if (/(?:make|generate|create|save|download|send)\s+(?:it\s+into\s+a?\s*)?html\b/i.test(clean) || /(?:html\s+file|download\s+html|send\s+html|play\s+game|download\s+game|make\s+game|create\s+game)/i.test(clean)) {
            await handleGenerateHtmlGameAction({ sock, senderJid, normalizedJid, senderName });
            continue;
          }

          // --- HELP & OPERATOR COMMAND ---
          if (/^(help|support|contact|operator|admin|info)$/i.test(clean)) {
            const currentSt = session?.station || defaultStation;
            await sock.sendMessage(senderJid, {
              text:
                `ℹ️ *PrintKurox Student Support*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📍 *Active Station:* ${currentSt.name} (${currentSt.room})\n` +
                `📞 *Operator Helpline:* +91 ${currentSt.contact || STATION_CONTACT}\n` +
                `⚡ *Standard Rates:* B&W ₹4/p · Color ₹7/p\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `*How to Print:*\n` +
                `1. Send your PDF, Word doc, or photo here.\n` +
                `2. Add more files or continue to settings.\n` +
                `3. Choose Color, Pages, and Copies.\n` +
                `4. Pay via UPI or Cash at counter.\n` +
                `5. Enter your Pickup Code on the printer screen!\n\n` +
                `_Tip: Send multiple files to bundle them under 1 single pickup code._`,
            });
            continue;
          }

          // --- RESET COMMAND ---
          if (clean === 'reset' || clean === 'restart' || clean === 'change') {
            if (session) {
              session.stage = 'QUEUE_STAGING';
              session.colorMode = null;
              session.copies = 1;
              session.selectedPages = null;
              session.pageRangeStr = 'All';
              session.paymentLinkUrl = null;
              session.paymentLinkId = null;
              session.jobId = null;
              session.pickupCode = null;
              session.timestamp = Date.now();
              if (session.queuedFiles && session.queuedFiles.length > 0) {
                await sendQueueStagingCard({ sock, senderJid, session });
                continue;
              } else if (session.fileName) {
                await sendStep1Buttons(sock, senderJid, session.fileName, session.totalPages, session.fileSizeMb);
                continue;
              }
            }
          }

          // --- CHANGE OR VIEW PRINT STATIONS ---
          if (clean === 'station' || clean === 'stations' || clean.startsWith('station ')) {
            const stationArg = clean.replace(/^stations?/, '').trim();
            if (stationArg) {
              let chosen = null;
              if (stationArg === '1' || stationArg === 'b' || stationArg === 'block b' || stationArg === 'pare') {
                chosen = AVAILABLE_STATIONS.find((s) => s.id === 'block_b');
              } else if (stationArg === '2' || stationArg === 'c' || stationArg === 'block c' || stationArg === 'dibang') {
                chosen = AVAILABLE_STATIONS.find((s) => s.id === 'block_c');
              } else if (stationArg === '3' || stationArg === 'romen' || stationArg === 'main gate') {
                chosen = AVAILABLE_STATIONS.find((s) => s.id === 'romen_xerox');
              }

              if (chosen) {
                if (session) session.station = chosen;
                await sock.sendMessage(senderJid, {
                  text: `✅ *Print Station Updated!*\n📍 *${chosen.name}* (${chosen.room})\n\nYour prints will be routed to this printer screen.`,
                });
                continue;
              }
            }

            const currentSt = session?.station || defaultStation;
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '📍 Campus Print Stations',
              body:
                `Current Destination: *${currentSt.name}* (${currentSt.room})\n\n` +
                `Tap an option below to change your pickup printer:`,
              footer: 'PrintKurox AutoPrint',
              buttons: STATION_BUTTONS,
            });
            continue;
          }

          // --- TYPED FALLBACK: STEP 1 (COLOR MODE) ---
          if (session && session.stage === 'AWAITING_COLOR_MODE') {
            let chosenMode = null;
            if (clean === '1' || clean === 'bw' || clean.includes('black') || clean.includes('b&w')) {
              chosenMode = 'bw';
            } else if (clean === '2' || clean === 'color' || clean.includes('colour')) {
              chosenMode = 'color';
            }

            if (chosenMode) {
              session.colorMode = chosenMode;
              session.timestamp = Date.now();

              console.log(`[WA-Bot] ${senderName} typed ${chosenMode}`);
              if (session.totalPages > 1) {
                await sendStep2PageButtons(sock, senderJid, session);
              } else {
                session.selectedPages = [1];
                session.pageRangeStr = 'All';
                await sendStep3CopiesButtons(sock, senderJid, session);
              }
              continue;
            } else {
              await sock.sendMessage(senderJid, {
                text: `👉 Please tap an option button above, or reply *1* for *Black & White* or *2* for *Color*.`,
              });
              continue;
            }
          }

          // --- TYPED FALLBACK: STEP 2 (PAGE SELECTION) ---
          if (session && session.stage === 'AWAITING_PAGE_SELECTION') {
            if (clean === '1' || clean === 'all' || clean === 'all pages' || clean === 'ok' || clean === 'full' || clean === 'everything') {
              session.selectedPages = Array.from({ length: session.totalPages }, (_, i) => i + 1);
              session.pageRangeStr = 'All';
              session.timestamp = Date.now();
              console.log(`[WA-Bot] ${senderName} typed All Pages, advancing to Copies`);
              await sendStep3CopiesButtons(sock, senderJid, session);
              continue;
            }

            if (clean === '2' || clean === 'custom' || clean === 'custom range' || clean === 'range' || clean === 'pages' || clean === 'select') {
              session.stage = 'AWAITING_CUSTOM_RANGE';
              session.timestamp = Date.now();
              await sock.sendMessage(senderJid, {
                text:
                  `🔢 *Custom Page Range:*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Total pages in file: *${session.totalPages}*\n\n` +
                  `Reply with the pages you want to print, e.g.:\n` +
                  `• *1, 3* (to print pages 1 and 3)\n` +
                  `• *1-${Math.min(3, session.totalPages)}* (pages 1 to ${Math.min(3, session.totalPages)})\n` +
                  `• *all* (to print all pages)\n` +
                  `• *odd* or *even*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              });
              continue;
            }

            // Direct page range typed while in page selection (e.g. user typed "1 and 3", "1, 3", "1-2", "odd", "even")
            const parsed = parsePageRange(clean, session.totalPages);
            if (parsed.isValid) {
              session.selectedPages = parsed.pages;
              session.pageRangeStr = formatPageRange(parsed.pages);
              session.timestamp = Date.now();
              console.log(`[WA-Bot] ${senderName} directly specified pages: ${session.pageRangeStr}, advancing to Copies`);
              await sendStep3CopiesButtons(sock, senderJid, session);
              continue;
            }

            // Unrecognized input in page selection
            await sock.sendMessage(senderJid, {
              text: `👉 Reply *1* for *All Pages (1-${session.totalPages})* or *2* for *Custom Range* (or type page numbers like *1, 3* directly).`,
            });
            continue;
          }

          // --- TYPED FALLBACK: STEP 2 (CUSTOM RANGE INPUT) ---
          if (session && session.stage === 'AWAITING_CUSTOM_RANGE') {
            const parsed = parsePageRange(clean, session.totalPages);

            if (parsed.isValid) {
              session.selectedPages = parsed.pages;
              session.pageRangeStr = formatPageRange(parsed.pages);
              session.timestamp = Date.now();
              console.log(`[WA-Bot] ${senderName} specified custom pages: ${session.pageRangeStr}, advancing to Copies`);
              await sendStep3CopiesButtons(sock, senderJid, session);
              continue;
            }

            if (parsed.outOfBounds.length > 0) {
              await sock.sendMessage(senderJid, {
                text:
                  `⚠️ *Page Number Out of Range!*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Your file only has *${session.totalPages} pages* (1 to ${session.totalPages}).\n` +
                  `Page(s) *${parsed.outOfBounds.join(', ')}* do not exist.\n\n` +
                  `Please reply with valid pages (e.g., *1, 3* or *1-${session.totalPages}*).`,
              });
              continue;
            }

            await sock.sendMessage(senderJid, {
              text:
                `⚠️ *Invalid Page Format*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Total pages in file: *${session.totalPages}*\n\n` +
                `Reply with the pages you want to print, e.g.:\n` +
                `• *1, 3* (or *1 and 3*)\n` +
                `• *1-${Math.min(3, session.totalPages)}* (a range of pages)\n` +
                `• *all* (to print all pages)\n` +
                `• *odd* or *even*`,
            });
            continue;
          }

          // --- TYPED FALLBACK: STEP 3 (COPIES & CUSTOM COPIES) ---
          if (session && (session.stage === 'AWAITING_COPIES' || session.stage === 'AWAITING_CUSTOM_COPIES')) {
            let copies = 1;
            if (clean === '1' || clean === '1 copy') copies = 1;
            else if (clean === '2' || clean === '2 copies') copies = 2;
            else if (clean === '3' || clean === '3 copies') copies = 3;
            else if (/^\d+$/.test(clean)) copies = Math.max(1, Math.min(50, parseInt(clean, 10)));
            else {
              const copiesMatch = clean.match(/(\d+)\s*(?:copies|copy|c|sets?|times)\b/i);
              if (copiesMatch) copies = Math.max(1, Math.min(50, parseInt(copiesMatch[1], 10)));
            }

            session.copies = copies;
            if (!session.selectedPages) {
              session.selectedPages = Array.from({ length: session.totalPages }, (_, i) => i + 1);
              session.pageRangeStr = 'All';
            }
            session.orientation = session.isLandscapeDefault ? 'landscape' : 'portrait';
            session.timestamp = Date.now();

            console.log(`[WA-Bot] ${senderName} selected ${copies} copies, advancing to Summary & 1-Tap UPI`);
            await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
            continue;
          }

          // --- TYPED FALLBACK: SUMMARY, PREVIEW & PAYMENT ---
          if (session && (session.stage === 'AWAITING_SUMMARY_CONFIRMATION' || session.stage === 'AWAITING_PAYMENT')) {
            if (clean.includes('preview') || clean.includes('view') || clean.includes('show')) {
              await sendDocumentVisualPreview({ sock, senderJid, senderName, session });
              continue;
            }

            if (
              clean === 'proceed' ||
              clean.includes('pay') ||
              clean.includes('upi') ||
              clean.includes('link') ||
              clean.includes('qr') ||
              clean === 'ok' ||
              clean === 'yes' ||
              clean === 'p'
            ) {
              if (session.paymentLinkUrl) {
                await sock.sendMessage(senderJid, {
                  text:
                    `💳 *PrintKurox AutoPrint Payment*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `📄 *Document:* ${session.fileName}\n` +
                    `💰 *Amount Due:* *₹${session.totalPrice || 0}*\n` +
                    `📍 *Station:* ${session.station?.name || defaultStation.name}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `👉 *Tap link to pay via UPI (GPay / PhonePe / Paytm):*\n` +
                    `🔗 ${session.paymentLinkUrl}\n\n` +
                    `_Your document will print automatically once payment is received._\n` +
                    `_Code: ${session.pickupCode || 'Active'}_`,
                });
                continue;
              }
              await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              continue;
            }
          }

          // --- CASH CONFIRMATION (WHEN AWAITING PAYMENT) ---
          if (clean === 'cash' || clean === 'pay cash' || clean === 'counter') {
            await handleCashOrder({ sock, senderJid, session });
            continue;
          }

          // --- STATUS & RECENT CODE ---
          if (clean === 'code' || clean === 'status' || clean === 'my code') {
            if (session && session.pickupCode) {
              await sock.sendMessage(senderJid, {
                text:
                  `🔑 *Your Active Pickup Code:*\n` +
                  `👉  *【 ${session.pickupCode} 】*  👈\n\n` +
                  `📄 *File:* ${session.fileName}\n` +
                  `💰 *Amount:* ₹${session.totalPrice || 0}\n` +
                  `📍 *Station:* ${STATION_NAME}`,
              });
              continue;
            }

            const recent = await queryD1(
              `SELECT pickup_code, file_name, total_price, status FROM print_jobs WHERE station_id = ? ORDER BY created_at DESC LIMIT 1`,
              [STATION_ID]
            );

            if (recent.length > 0) {
              const j = recent[0];
              await sock.sendMessage(senderJid, {
                text:
                  `🔑 *Most Recent Pickup Code:*\n` +
                  `👉  *【 ${j.pickup_code} 】*  👈\n\n` +
                  `📄 *File:* ${j.file_name}\n` +
                  `📊 *Status:* ${j.status}\n` +
                  `📍 *Station:* ${STATION_NAME}`,
              });
              continue;
            }
          }

          // --- UNIVERSAL GREETING & SERVICE SELECTION MENU ---
          // Matches "Hi PrintKurox, I want to print", "hi", "hello", QR scans, etc.
          const isPrintGreetingIntent =
            clean.includes('i want to print a document') ||
            clean.includes('i want to print') ||
            clean.includes('hi printkurox') ||
            clean.includes('print a document') ||
            clean.startsWith('hi print') ||
            clean.startsWith('hello print');

          const isPureMenuCommand = /^(start|menu|options|help|services|info)$/i.test(clean);

          if (isPrintGreetingIntent || isPureMenuCommand) {
            appendBotLog(`[Greeting] Matched greeting from ${senderName} (${senderJid}), dispatching menu card`);
            const cleanName = (senderName && /^[a-zA-Z\s]{2,25}$/.test(senderName.trim())) ? (' ' + senderName.trim()) : '';
            const welcomeLine = cleanName ? `👋 Hi${cleanName}! Welcome to PrintKurox.` : `👋 Welcome to PrintKurox Campus Services!`;
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '⚡ NERIST Campus Assistant',
              body: `${welcomeLine}\n\n• 🖨️ *Print documents:* Forward PDFs/photos to print at Block B Kiosk\n• 📄 *Assignment Cover:* Create official PDF & Word covers with red crest\n• 📝 *Applications:* Draft formal leave letters to HOD/Warden\n• 🎓 *Directory:* Search 3900+ students and 350+ faculty\n\n_Please choose a service below:_`,
              footer: 'PrintKurox AutoPrint',
              buttons: [
                { id: 'btn_flow_printing', text: '🖨️ Printing Services' },
                { id: 'btn_flow_agent', text: '🤖 Agent Chatbot' },
                { id: 'btn_flow_student', text: '👥 Student Search' },
              ],
            });
            appendBotLog(`[Greeting] Menu card dispatched to ${senderJid}`);
            continue;
          }

          // Direct typed choice or button tap: "1", "print", "btn_flow_printing" -> Direct Printing Disambiguation
          if ((clean === '1' || clean === 'print' || clean === 'autoprint' || buttonId === 'btn_flow_printing') && (!session || session.stage === 'COMPLETED')) {
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '🖨️ Campus Printing Services',
              body: `Choose how you would like to print your documents:`,
              footer: 'PrintKurox · Hostel Block B Kiosk',
              buttons: [
                { text: '🌐 Print via Website', url: `${PUBLIC_KIOSK_URL}/` },
                { id: 'btn_print_via_whatsapp', text: '📱 Print via WhatsApp' },
              ],
            });
            continue;
          }

          // Direct typed choice or button tap: "2", "agent", "btn_flow_agent" -> Agent Kurox Studio
          if ((clean === '2' || buttonId === 'btn_flow_agent' || /^(agent|agent\s+chatbot|chatbot|kurox|agent\s+kurox|what\s+can\s+you\s+do|introduction|intro)$/i.test(clean)) && (!session || session.stage === 'COMPLETED')) {
            userLastOpenedStudio.set(senderJid, 'agent_hub');
            if (normalizedJid) userLastOpenedStudio.set(normalizedJid, 'agent_hub');
            const hr = new Date().getHours();
            const timeGreeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
            const cleanName = (senderName && /^[a-zA-Z\s]{2,25}$/.test(senderName.trim())) ? `, ${senderName.trim()}` : '';
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: 'Agent Kurox · Campus AI Companion',
              body:
                `*${timeGreeting}${cleanName}!* ☀️\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `I am *Agent Kurox*, your advanced AI assistant and campus companion at NERIST.\n\n` +
                `You can consult me on engineering derivations, mathematical solutions, programming, campus procedures, and academic drafting.\n\n` +
                `*Quick Studio Options:*\n\n` +
                `1. 📄 *Assignment Front Cover* — 1-Click official NERIST front covers\n` +
                `2. 📝 *Academic Application* — Formal leave, medical, or NOC requests\n` +
                `3. 🎮 *Offline Mini-Games & Tools* — Playable browser tools (Snake, Ludo, Calculators)\n` +
                `4. 🔍 *Campus Directory* — Search students and faculty records\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `🎓 *Cinderac & SymphonyX Campus Integration:*\n` +
                `Reply \`login <RegId> <Password>\` to check your live attendance & bunk limits, semester SGPA/CGPA trend graph, or download official admit cards!\n` +
                `_(Creating covers & applications is 100% free and never requires login)_\n\n` +
                `_Tap an action below, reply with a number (1-4), or type any question:_`,
              footer: 'Agent Kurox · Campus AI Companion',
              buttons: [
                { id: 'btn_flow_cover', text: '📄 Assignment Front Cover' },
                { id: 'btn_flow_application', text: '📝 Academic Application' },
                { id: 'btn_flow_game', text: '🎮 Offline Mini-Game' },
                { id: 'btn_flow_student', text: '🔍 Directory Search' },
              ],
            });
            continue;
          }

          // Direct typed choice: "3" -> Student Directory Search
          if (clean === '3' && (!session || session.stage === 'COMPLETED')) {
            const resolvedUserPhone = await resolveUserPhone(sock, senderJid);
            await handleStudentMessage({
              sock,
              getSock: () => activeBotSock,
              msg,
              rawBody: '',
              lowerBody: '',
              buttonId: 'btn_flow_student',
              senderJid,
              sendInteractiveButtons,
              razorpay,
              userPhone: resolvedUserPhone,
            });
            continue;
          }

          // If session exists in QUEUE_STAGING, handle print intents or conversational AI questions
          if (session && session.stage === 'QUEUE_STAGING') {
            if (/^(proceed|print|continue|done|yes|ok|next|go|proceed\s+to\s+print)$/i.test(clean)) {
              await continueWithQueuedFiles({ sock, senderJid, session, senderName });
              continue;
            }
            if (/^(cancel|clear|stop|exit|quit|abort|cancel\s+print|clear\s+queue)$/i.test(clean)) {
              purgeUserPrintSession(senderJid, normalizedJid);
              await sock.sendMessage(senderJid, {
                text: `🗑️ *Print Queue Cleared!*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nAll staged files have been discarded.\nWhenever you're ready, simply forward or send a document/photo to start fresh!`,
              });
              continue;
            }
            if (/^(rescan|re-scan|scan\s+again|check|recheck)$/i.test(clean)) {
              await handleRescanRecentFiles({ sock, senderJid, normalizedJid, session, senderName });
              continue;
            }
            if (/^(add|more|add\s+more|upload|attach)$/i.test(clean)) {
              await sock.sendMessage(senderJid, {
                text: `📎 *Send your next file here!*\nI will add it to your batch (${session.queuedFiles?.length || 0} files currently queued).\n\n_Reply *proceed* when finished!_`,
              });
              continue;
            }

            // Conversational query / asking AI to read/solve photo / campus chat while files are staged:
            const aiHandled = await handleAIChatMessage({
              sock,
              senderJid,
              normalizedJid,
              text: textMsg || clean,
              senderName,
              isGroup: false,
              rawMessage: msg,
              logFn: appendBotLog,
              sendButtonsFn: sendInteractiveButtons,
              userPhone: userActivityPhone,
              stagedPrintContext: {
                fileCount: session.queuedFiles?.length || 1,
                stage: session.stage,
                station: session.station || defaultStation,
              },
            });
            if (aiHandled) {
              const fileCount = session.queuedFiles?.length || 1;
              await sendInteractiveButtons({
                sock,
                jid: senderJid,
                title: '🖨️ Staged Print Queue',
                body: `You have *${fileCount}* file${fileCount === 1 ? '' : 's'} staged in your print queue for Hostel Block B.\n\nChoose an action below:`,
                footer: 'PrintKurox AutoPrint',
                buttons: [
                  { id: 'btn_queue_continue', text: `✅ Proceed to Print (${fileCount} ${fileCount === 1 ? 'File' : 'Files'})` },
                  { id: 'btn_queue_rescan', text: '🔄 Rescan Recent Files' },
                  { id: 'btn_queue_clear', text: '❌ Cancel Print' },
                ],
              }).catch(() => {});
              continue;
            }
          }

          // If session is in other active stages (e.g. AWAITING_COLOR_MODE, AWAITING_PAGE_SELECTION, etc.)
          if (session && session.stage && session.stage !== 'COMPLETED') {
            const aiHandled = await handleAIChatMessage({
              sock,
              senderJid,
              normalizedJid,
              text: textMsg || clean,
              senderName,
              isGroup: false,
              rawMessage: msg,
              logFn: appendBotLog,
              sendButtonsFn: sendInteractiveButtons,
              userPhone: userActivityPhone,
              stagedPrintContext: {
                stage: session.stage,
                station: session.station || defaultStation,
              },
            });
            if (aiHandled) continue;

            await sock.sendMessage(senderJid, {
              text: `👉 Please choose one of the options above for your document, or reply *cancel* to start fresh!`,
            });
            continue;
          }

          // Conversational AI: In DM, if user sent a question or chat and has no active print session, let AI answer!
          const aiHandled = await handleAIChatMessage({
            sock,
            senderJid,
            normalizedJid,
            text: textMsg || clean,
            senderName,
            isGroup: false,
            rawMessage: msg,
            logFn: appendBotLog,
            sendButtonsFn: sendInteractiveButtons,
            userPhone: userActivityPhone,
          });
          if (aiHandled) continue;

          // Universal fallback for ANY incoming text query when no active session exists:
          appendBotLog(`[Fallback] Unhandled text from ${senderName} (${senderJid}): "${clean.slice(0, 50)}", dispatching welcome card`);
          const cleanName = (senderName && /^[a-zA-Z\s]{2,25}$/.test(senderName.trim())) ? (' ' + senderName.trim()) : '';
          const welcomeLine = cleanName ? `👋 Hi${cleanName}! Welcome to PrintKurox.` : `👋 Welcome to PrintKurox Campus Services!`;
          await sendInteractiveButtons({
            sock,
            jid: senderJid,
            title: '⚡ NERIST Campus Assistant',
            body: `${welcomeLine}\n\n• 🖨️ *Print documents:* Forward PDFs/photos to print at Block B Kiosk\n• 📄 *Assignment Cover:* Create official PDF & Word covers with red crest\n• 📝 *Applications:* Draft formal leave letters to HOD/Warden\n• 🎓 *Directory:* Search 3900+ students and 350+ faculty\n\n_Please choose a service below:_`,
            footer: 'PrintKurox AutoPrint',
            buttons: [
              { id: 'btn_flow_printing', text: '🖨️ Printing Services' },
              { id: 'btn_flow_agent', text: '🤖 Agent Chatbot' },
              { id: 'btn_flow_student', text: '👥 Student Search' },
            ],
          });
          continue;
        }
      }
    } catch (msgErr) {
      console.error('[WA-Bot] Error processing message:', msgErr);
      appendBotLog(`[ERROR] Processing message: ${msgErr?.stack || msgErr}`);
    }
  });
  } finally {
    isStartingBot = false;
  }
}

process.on('uncaughtException', (err) => {
  console.error('[WA-Bot UncaughtException]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[WA-Bot UnhandledRejection]:', reason);
});

async function runWithAutoRestart() {
  try {
    await startBot();
  } catch (err) {
    console.error('[WA-Bot] Fatal startBot error:', err?.message || err, '. Retrying in 5s...');
    setTimeout(runWithAutoRestart, 5000);
  }
}
runWithAutoRestart();
