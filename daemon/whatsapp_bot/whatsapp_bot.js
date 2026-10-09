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

require('dotenv').config();
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
const { PDFDocument } = require('pdf-lib');
const Razorpay = require('razorpay');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { convertDocxToPdf, findSoffice } = require('./docx_converter');
const { handleStudentMessage } = require('./student_bot_module');
const { generatePreviewImage } = require('./pdf_preview_renderer');

// Configuration from .env
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'kiosk-uploads';
const PUBLIC_KIOSK_URL = process.env.PUBLIC_KIOSK_URL || 'https://printkurox.vercel.app';
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

// Active Payment Link Pollers (jobId -> Interval)
const activePollers = new Map();

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
  const randomLetter = letters[Math.floor(Math.random() * letters.length)];
  const randomNumber = Math.floor(Math.random() * 900) + 100;
  return `#${randomLetter}${randomNumber}`;
}

function parsePageRange(rangeStr, maxPages) {
  if (!rangeStr || rangeStr.trim().toLowerCase() === 'all') {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }

  const pagesSet = new Set();
  const parts = rangeStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end));
        const max = Math.min(maxPages, Math.max(start, end));
        for (let i = min; i <= max; i++) pagesSet.add(i);
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) {
        pagesSet.add(page);
      }
    }
  }

  return Array.from(pagesSet).sort((a, b) => a - b);
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
  if (lidMappingCache.has(baseLid)) {
    return lidMappingCache.get(baseLid).split('@')[0].replace(/[^0-9]/g, '').slice(-10);
  }
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

/**
 * Resolve phone number for a sender JID or fallback to kiosk station contact
 */
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

  // Resolve @lid to @s.whatsapp.net if possible (instant in-memory cache)
  let targetJid = jid;
  if (jid.endsWith('@lid')) {
    const lidNum = jid.split('@')[0];
    if (lidMappingCache.has(lidNum)) {
      targetJid = lidMappingCache.get(lidNum);
    } else {
      try {
        const authDir = path.join(__dirname, 'session_auth');
        const revPath = path.join(authDir, `lid-mapping-${lidNum}_reverse.json`);
        if (fs.existsSync(revPath)) {
          const pn = JSON.parse(fs.readFileSync(revPath, 'utf8'));
          if (pn) {
            targetJid = `${pn}@s.whatsapp.net`;
            lidMappingCache.set(lidNum, targetJid);
          }
        } else if (sock?.signalRepository?.lidMapping?.getPNForLID) {
          const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
          if (pn) {
            targetJid = `${pn}@s.whatsapp.net`;
            lidMappingCache.set(lidNum, targetJid);
          }
        }
      } catch (e) {}
    }
  }

  const nativeButtons = buttons.map((btn) => {
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
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: btn.text,
        id: btn.id,
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
                title: title || '',
                hasMediaAttachment: false,
              }),
              body: proto.Message.InteractiveMessage.Body.fromObject({
                text: body,
              }),
              footer: proto.Message.InteractiveMessage.Footer.fromObject({
                text: footer,
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
    if (waMsg?.key?.id && waMsg?.message) {
      messageStore.set(waMsg.key.id, waMsg.message);
    }
    return waMsg;
  } catch (btnErr) {
    console.warn('[WA-Bot] sendInteractiveButtons relay error:', btnErr.message);
    // Send fallback text only if relayMessage failed
    try {
      const buttonPrompts = buttons
        .map((b, idx) => b.url ? `🔗 *${b.text}:* ${b.url}` : `🔘 *${b.text}*`)
        .join('\n');
      const fallback = `${title ? '*' + title + '*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n' : ''}${body}${buttonPrompts ? '\n\n' + buttonPrompts : ''}${footer ? '\n\n_' + footer + '_' : ''}`;
      await sock.sendMessage(targetJid, { text: fallback.trim() });
    } catch (e) {}
    return null;
  }
}

// ============================================================================
// ADMIN PROMOTION & DIRECTORY BROADCAST HELPER
// ============================================================================
const ADMIN_NUMBERS = ['9863013886', '9362980761'];
const PROMO_LOG_FILE = path.join(__dirname, 'sent_promo_recipients.json');
const USER_ACTIVITY_LOG_FILE = path.join(__dirname, 'user_activity_log.json');

// In-Memory Campaign Staging State for Admin (adminJid -> { timeframeLabel, hours, recipients: [], isAwaitingRemoval: bool })
const adminCampaignState = new Map();

function isSenderAdmin(senderJid, normalizedJid, isMessageToSelf, resolvedPhone = null) {
  if (isMessageToSelf) return true;
  if (resolvedPhone && ADMIN_NUMBERS.includes(resolvedPhone.slice(-10))) return true;
  if (!senderJid && !normalizedJid) return false;
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
  const title = '🎓 *NERIST CAMPUS DIRECTORY* · 2026 Edition';
  const body =
    `*Connect with any NERIST student in seconds!*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👋 Hey NERISTian!\n\n` +
    `Need to reach a batchmate, find a senior's roll number, or connect with a classmate across departments?\n\n` +
    `Stop asking around in 10 different WhatsApp groups! The *Official NERIST Student Directory* is now integrated directly into this bot:\n\n` +
    `⚡ *What you can search instantly:*\n` +
    `• 🔍 *Name & Roll Number:* Look up any student across all batches\n` +
    `• 📞 *Direct Contact Info:* Verified phone numbers & branch records\n` +
    `• 🏛️ *Batch & Stream Info:* Degree, Diploma, Base Module & Forestry\n` +
    `• 🔒 *Fast & Confidential:* 100% instant within this WhatsApp chat\n\n` +
    `💡 *Tap below to try a search right now:*`;

  const buttons = [
    { id: 'btn_flow_student', text: '🎓 Search Student Directory' },
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
 * Discovers active students within specified hours from activity log and session_auth (with real student names)
 */
async function getActiveStudentsInTimeframe(hours = 24, sock = null) {
  const cutoffMs = Date.now() - (hours * 60 * 60 * 1000);
  const foundMap = new Map();

  // 1. Check user_activity_log.json
  const activityLog = loadUserActivityLog();
  for (const [phone, item] of Object.entries(activityLog)) {
    const activeTime = new Date(item.lastActive || 0).getTime();
    if (activeTime >= cutoffMs) {
      const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
      if (/^[6-9]\d{9}$/.test(cleanPhone)) {
        const studentName = (item.name && item.name !== 'Student' && item.name !== 'WhatsApp User') ? item.name : getStudentNameByPhone(cleanPhone);
        const validName = (studentName && studentName !== 'Student' && studentName !== 'WhatsApp User') ? studentName : null;
        foundMap.set(cleanPhone, {
          phone: cleanPhone,
          jid: item.jid || `91${cleanPhone}@s.whatsapp.net`,
          name: validName,
          lastActive: item.lastActive,
        });
      }
    }
  }

  // 2. Check session_auth directory for recent direct PN sessions and LIDs
  try {
    const authDir = path.join(__dirname, 'session_auth');
    if (fs.existsSync(authDir)) {
      const files = fs.readdirSync(authDir);
      for (const file of files) {
        if (file.startsWith('session-') && file.endsWith('.json')) {
          const filePath = path.join(authDir, file);
          const mtime = fs.statSync(filePath).mtimeMs;
          if (mtime >= cutoffMs) {
            const rawId = file.replace(/^session-/, '').split('.')[0];
            let cleanPhone = null;

            if (rawId.startsWith('91') && rawId.length === 12) {
              cleanPhone = rawId.slice(-10);
            } else if (rawId.endsWith('@s.whatsapp.net')) {
              cleanPhone = rawId.split('@')[0].replace(/[^0-9]/g, '').slice(-10);
            } else {
              // Multi-directory reverse LID mapping lookup
              cleanPhone = resolveLidToPhone(rawId);
              if (!cleanPhone && sock?.signalRepository?.lidMapping?.getPNForLID) {
                try {
                  const baseLid = String(rawId).split(/[_:]/)[0];
                  const pn = await sock.signalRepository.lidMapping.getPNForLID(`${baseLid}@lid`);
                  if (pn) {
                    const digits = pn.split('@')[0].replace(/[^0-9]/g, '').slice(-10);
                    if (/^[6-9]\d{9}$/.test(digits)) cleanPhone = digits;
                  }
                } catch (e) {}
              }
            }

            // CRITICAL: ONLY add verified 10-digit Indian phone numbers
            // User instruction: Never show raw IDs or "User (ID: ...)"
            if (cleanPhone && /^[6-9]\d{9}$/.test(cleanPhone)) {
              if (!foundMap.has(cleanPhone)) {
                const sName = getStudentNameByPhone(cleanPhone);
                const validName = (sName && sName !== 'Student' && sName !== 'WhatsApp User') ? sName : null;
                foundMap.set(cleanPhone, {
                  phone: cleanPhone,
                  jid: `91${cleanPhone}@s.whatsapp.net`,
                  name: validName,
                  lastActive: new Date(mtime).toISOString(),
                });
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  // 3. Exclude admin numbers, bot itself, and bot's own LID
  for (const adminNum of ADMIN_NUMBERS) {
    const cleanAdmin = adminNum.slice(-10);
    foundMap.delete(cleanAdmin);
  }
  foundMap.delete('261469505642610');
  foundMap.delete('9362980761');
  foundMap.delete('9863013886');

  return Array.from(foundMap.values()).sort(
    (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
  );
}

/**
 * Dispatches the Campaign Audience Review card with guaranteed 0ms text display and disambiguous buttons
 */
async function sendCampaignReviewCard({ sock, adminJid, campaign, noticeText = '' }) {
  const count = campaign.recipients.length;
  let listStr = '';

  // Requirement: Show ALL numbers directly without truncation (no maxDisplay limit)
  campaign.recipients.forEach((r, idx) => {
    const phone = r.phone.slice(-10);
    const hasValidName = r.name && r.name !== 'Student' && r.name !== 'WhatsApp User';
    const line = hasValidName ? `${idx + 1}. *+91 ${phone}* (${r.name})` : `${idx + 1}. *+91 ${phone}*`;
    listStr += `${line}\n`;
  });

  const title = `*Campaign Audience Review* · ${campaign.timeframeLabel}`;
  const cardText =
    (noticeText ? `${noticeText}\n\n` : '') +
    (count > 0
      ? `📋 *Campaign Audience Review* · ${campaign.timeframeLabel}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Found *${count}* active student contact(s) from the past ${campaign.timeframeLabel}:\n\n` +
        `${listStr}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 *Total Audience:* *${count}* recipient(s)\n\n` +
        `👉 *Tap the disambigous action buttons below or reply directly:*\n` +
        `• Tap *🚀 Send to All (${count})* ➔ Dispatches promotional card\n` +
        `• Tap *❌ Remove Numbers* ➔ Exclude specific numbers\n` +
        `• Tap *🚫 Cancel Broadcast* ➔ Clears staged campaign`
      : `⚠️ *No contacts found or remaining in this audience.*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Reply with numbers directly (e.g. \`@send 9863013886, ...\`) or use \`@send 7d\` to expand the search timeframe._`);

  // 1. ALWAYS send standard text FIRST to guarantee 0ms instant display without "Waiting for this message" delays
  await sock.sendMessage(adminJid, { text: cardText });

  // 2. ALWAYS dispatch interactive (disambiguous) buttons so the admin can click them directly!
  if (count > 0) {
    try {
      await sendInteractiveButtons({
        sock,
        jid: adminJid,
        title,
        body: `Select an action below for this audience (${count} recipients):`,
        footer: 'PrintKurox Campaign Manager · Admin',
        buttons: [
          { id: 'btn_campaign_send', text: `🚀 Send to All (${count})` },
          { id: 'btn_campaign_remove_prompt', text: '❌ Remove Numbers' },
          { id: 'btn_campaign_cancel', text: '🚫 Cancel Broadcast' },
        ],
      });
    } catch (e) {
      console.warn('[WA-Bot] sendInteractiveButtons notice:', e.message);
    }
  }
}

/**
 * Executes promotional dispatch to staged campaign audience with anti-spam rate limiting
 */
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

  await sock.sendMessage(adminJid, { text: reportText });
}

async function sendStep1Buttons(sock, senderJid, fileName, totalPages, fileSizeMb) {
  const isBulk = totalPages >= 10;
  const title = `*PrintKurox* · Color Selection`;
  const body =
    `📄 *File:* ${fileName}\n` +
    `📊 *Pages:* ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} (${fileSizeMb} MB)\n` +
    `📍 *Station:* ${defaultStation.name} (${defaultStation.room})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    (isBulk
      ? `🎉 *Special Volume Offer Applied (10+ pages)!*\n` +
        `⚡ *B&W:* ₹3/page · 🎨 *Color:* ₹5/page\n` +
        `_(Applies to single pages only)_\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      : `💡 *Tip:* 10+ pages unlock B&W for ₹3/p & Color for ₹5/p (single page)!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`) +
    `Select print color below:`;

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title,
    body,
    footer: 'PrintKurox AutoPrint',
    buttons: isBulk ? STEP1_BUTTONS_BULK : STEP1_BUTTONS_STANDARD,
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
    `Choose pages to print:`;

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
  const standardRate = session.colorMode === 'color' ? 7 : 4;
  const ratePerPage = session.colorMode === 'color' ? (isBulk ? 5 : 7) : (isBulk ? 3 : 4);
  const totalAmount = Math.max(1, totalPrintedPages * ratePerPage);
  const totalSavings = isBulk ? (standardRate - ratePerPage) * totalPrintedPages : 0;
  session.totalPrice = totalAmount;

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

  const summaryBody =
    `📄 *Document:* ${session.fileName}\n` +
    `🖨️ *Print Mode:* ${printTypeLabel} (₹${ratePerPage}/p${isBulk ? ' · Special Offer' : ''})\n` +
    `📑 *Pages:* ${session.pageRangeStr || 'All'} (${activePagesCount} of ${session.totalPages})\n` +
    `🔢 *Copies:* ${totalCopies} ${totalCopies === 1 ? 'copy' : 'copies'}${totalCopies > 1 ? ` (${totalPrintedPages} total pages printed)` : ''}\n` +
    `📐 *Orientation:* ${orientLabel} (Natural)\n` +
    `📍 *Release Station:* ${currentStation.name} (${currentStation.room})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *Total Amount:* *₹${totalAmount}*` +
    (isBulk ? ` _(🎉 Saved ₹${totalSavings}!)_` : '') + `\n` +
    (isBulk ? `⚡ _Applied ₹${ratePerPage}/p volume offer (${totalPrintedPages} total pages printed)_\n` : '') +
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
          `💡 *Did you know?*\n` +
          `You can look up classmate phone numbers, roll numbers, and branch records directly on this bot!\n\n` +
          `_Need help? Call operator: +91 ${STATION_CONTACT}_`;

        await sendInteractiveButtons({
          sock,
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
    `💡 *Did you know?*\n` +
    `You can look up classmate phone numbers, roll numbers, and branch records directly on this bot!`;

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

/**
 * Fast binary header inspection to detect if image is Landscape (width > height)
 */
function detectImageLandscape(buffer) {
  try {
    if (!buffer) return false;
    // PNG inspection: IHDR width at offset 16, height at offset 20
    if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
      const w = buffer.readUInt32BE(16);
      const h = buffer.readUInt32BE(20);
      return w > h;
    }
    // JPEG inspection: SOF0/SOF2 marker
    if (buffer.length > 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
      for (let i = 2; i < buffer.length - 8; i++) {
        if (buffer[i] === 0xFF && (buffer[i + 1] === 0xC0 || buffer[i + 1] === 0xC2)) {
          const h = buffer.readUInt16BE(i + 5);
          const w = buffer.readUInt16BE(i + 7);
          return w > h;
        }
      }
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
  const body =
    `${addedNotice}` +
    `📚 *Current Print Queue:*\n` +
    `${fileListLines}` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Total:* *${totalPages}* ${totalPages === 1 ? 'page' : 'pages'} (${totalSizeMb} MB)\n` +
    (isBulk
      ? `🎉 *Special Offer Unlocked (10+ pages)!* B&W ₹3/p · Color ₹5/p (Single page only)\n`
      : `💡 *Tip:* Add ${10 - totalPages} more page(s) to unlock B&W ₹3/p & Color ₹5/p!\n`) +
    `📍 *Station:* ${currentStation.name} (${currentStation.room})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `*Ready to print, or do you have more files to add?*\n` +
    `_Reply *proceed* to continue, *add* for more files, or *cancel* to quit._`;

  const buttons = [
    { id: 'btn_queue_continue', text: `✅ Proceed to Print (${count} ${count === 1 ? 'File' : 'Files'})` },
    { id: 'btn_queue_add_more', text: '➕ Add More Files' },
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
    finalBuffer = f.buffer;
    finalFileName = f.fileName;
    finalMimeType = f.mimeType;
    totalPages = f.pages;
    isLandscapeDefault = f.isLandscape;
    isMergedBatch = false;
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
              const dims = embeddedImage.scaleToFit(maxW, maxH);

              page.drawImage(embeddedImage, {
                x: (a4W - dims.width) / 2,
                y: (a4H - dims.height) / 2,
                width: dims.width,
                height: dims.height,
              });
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
      return {
        mediaObj: curr.imageMessage,
        mediaType: 'image',
        fileName: curr.imageMessage.fileName || `photo_${Date.now().toString().slice(-4)}.jpg`,
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

// Concurrency semaphore for WhatsApp media downloads (allows up to 4 concurrent downloads)
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
        const timeoutId = setTimeout(() => controller.abort(), 25000);
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
  const files = [...entry.files];
  incomingFileBuffers.delete(normalizedJid);

  let session = userSessions.get(senderJid) || userSessions.get(normalizedJid);

  // Intentional addition window: 3 minutes (180,000ms)
  // If user sends files within 3 minutes of previous files, add them to the batch!
  const isRecentBatch = session && (Date.now() - (session.timestamp || 0) < 180000) && session.stage !== 'COMPLETED' && session.stage !== 'AWAITING_PAYMENT';
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

    const sizeMb = (file.buffer.length / (1024 * 1024)).toFixed(2);

    session.queuedFiles.push({
      fileName: file.fileName,
      buffer: file.buffer,
      mimeType: file.mimeType,
      pages,
      isLandscape,
      sizeMb,
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

  console.log(`[WA-Bot] 📥 Media attachment received from ${senderName} (${senderJid}): "${fileName}" (${mediaType})`);

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

  let prepNotice = '⏳ *Receiving your files...*\nPlease wait a moment.';
  if (isPdfFile) {
    prepNotice = fileName
      ? `⏳ *Your PDF is preparing...*\n📄 _${fileName}_\nPlease wait a moment.`
      : `⏳ *Your PDF is preparing...*\nPlease wait a moment.`;
  } else if (isPhotoFile) {
    prepNotice = `⏳ *Your photo is preparing...*\nPlease wait a moment.`;
  } else if (isDocxFile) {
    prepNotice = `⏳ *Your Word document is preparing...*\n📄 _${fileName}_\nPlease wait a moment.`;
  }

  if (!entry.hasNotified) {
    entry.hasNotified = true;
    sock.sendMessage(senderJid, { text: prepNotice }, { quoted: msg }).catch(() => {});
  }

  const debounceDelay = 4500;
  const scheduleProcess = () => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(async () => {
      if (entry.activeDownloads > 0) {
        console.log(`[WA-Bot] ${entry.activeDownloads} download(s) still active for ${senderName}. Rescheduling buffer process...`);
        scheduleProcess();
        return;
      }
      try {
        await processBufferedFiles({ sock, senderJid, normalizedJid, senderName });
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
    } finally {
      entry.activeDownloads = Math.max(0, (entry.activeDownloads || 1) - 1);
    }

    if (!buffer || buffer.length === 0) {
      console.error(`[WA-Bot] ❌ Failed to download attachment "${fileName}" from ${senderName}`);
      sock.sendMessage(senderJid, {
        react: { text: '❌', key: msg.key },
      }).catch(() => {});
      await sock.sendMessage(senderJid, {
        text: `⚠️ Sorry ${senderName}, failed to download "${fileName}". Please try resending.`,
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

    entry.files.push({
      buffer,
      fileName,
      mimeType,
      isImg: isImgDetected,
      isPdf: isPdfDetected,
    });

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

async function startBot() {
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

  const botSentIds = new Set();
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

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[WA-Bot] SCAN THE QR CODE BELOW USING WHATSAPP:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nWaiting for QR scan...\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.warn(`[WA-Bot] Connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      } else {
        console.error('[WA-Bot] Logged out from WhatsApp. Delete "session_auth" folder and scan QR again.');
      }
    } else if (connection === 'open') {
      console.log('------------------------------------------------------------');
      console.log(`[SUCCESS] PrintKurox WhatsApp Bot is ONLINE & READY!`);
      console.log(`IndiGo-Style Action Buttons & Instant Payments Active.`);
      console.log('------------------------------------------------------------\n');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (type !== 'notify') return;
      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

        const senderJid = msg.key.remoteJid;
        const normalizedJid = jidNormalizedUser(senderJid);
        const senderName = msg.pushName || 'Student';
        const isGroup = senderJid.endsWith('@g.us');

        if (isGroup && !msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user?.id)) {
          continue;
        }

        // Normalize content to unwrap viewOnce wrappers automatically
        const content = normalizeMessageContent(msg.message);

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

        // Check if this message was sent by the bot itself
        if (msg.key.id && botSentIds.has(msg.key.id)) continue;

        const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
        const myLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : null;
        const myPhone = myJid ? myJid.split('@')[0].replace(/[^0-9]/g, '') : '9362980761';
        const isFromMe = msg.key.fromMe === true;

        // Resolve phone number of sender (handling LID reverse mappings)
        const userActivityPhone = await resolveUserPhone(sock, senderJid);

        // Allow message if it's sent to self or testing in the bot's own chat
        const isMessageToSelf = !isGroup && isFromMe && (
          senderJid === myJid ||
          senderJid === myLid ||
          (myPhone && senderJid.includes(myPhone)) ||
          (userActivityPhone && userActivityPhone === myPhone) ||
          (userActivityPhone && ADMIN_NUMBERS.includes(userActivityPhone.slice(-10)))
        );

        if (isFromMe && !isMessageToSelf) continue;

        // Acknowledge read receipt asynchronously to keep connection responsive
        sock.readMessages([msg.key]).catch(() => {});

        let session = userSessions.get(senderJid) || userSessions.get(normalizedJid);
        if (session) session.senderName = senderName;

        // Continuously record active student contact for automated audience discovery
        if (userActivityPhone) {
          recordUserActivity(userActivityPhone, senderJid, senderName);
        }

        const rawText =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          buttonText ||
          '';

        const trimmedText = rawText.trim();
        const lowerText = trimmedText.toLowerCase();

        // ======================================================================
        // ADMIN COMMANDS (@ad, @preview, @send, @send 24 hour, send 24 hour, 24 hour, @send <numbers>)
        // ======================================================================
        const isAdmin = isSenderAdmin(senderJid, normalizedJid, isMessageToSelf, userActivityPhone);

        // Preview command: sends promo to self/admin for manual verification or manual forwarding
        if (isAdmin && (lowerText === '@ad' || lowerText === '@preview' || lowerText === '@promo' || lowerText === '@ad_preview')) {
          const promo = getStudentDirectoryPromoCard();
          await sock.sendMessage(senderJid, {
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
          return;
        }

        // ======================================================================
        // ADMIN CAMPAIGN INTERACTIVE EXCLUSION & DISPATCH CONTROLLER
        // (Active staged campaign actions: send, cancel, remove, numeric input)
        // ======================================================================
        const activeCampaign = isAdmin ? (adminCampaignState.get(senderJid) || adminCampaignState.get(normalizedJid)) : null;

        if (activeCampaign) {
          const cleanAdminText = trimmedText.toLowerCase();

          // 1. Cancel / Exit Campaign
          if (/^(cancel|stop|abort|exit|quit|close)$/i.test(cleanAdminText)) {
            if (activeCampaign.isAwaitingRemoval) {
              activeCampaign.isAwaitingRemoval = false;
              await sendCampaignReviewCard({
                sock,
                adminJid: senderJid,
                campaign: activeCampaign,
                noticeText: 'ℹ️ Removal mode cancelled. Audience list preserved.',
              });
              return;
            } else {
              adminCampaignState.delete(senderJid);
              adminCampaignState.delete(normalizedJid);
              await sock.sendMessage(senderJid, {
                text: '🚫 *Campaign Broadcast Cancelled.*\nNo promotional messages were dispatched.',
              });
              return;
            }
          }

          // 2. Send / Proceed Broadcast
          if (/^(send|proceed|broadcast|go|ok)$/i.test(cleanAdminText)) {
            adminCampaignState.delete(senderJid);
            adminCampaignState.delete(normalizedJid);
            await executeCampaignBroadcast({ sock, adminJid: senderJid, campaign: activeCampaign });
            return;
          }

          // 3. Remove Command or Direct Numbers to Exclude
          const isRemoveCmd = /^(remove|delete|del|exclude)\b/i.test(cleanAdminText);
          const isNumericOnly = /^[\d\s,]+$/.test(cleanAdminText);

          if (isRemoveCmd || activeCampaign.isAwaitingRemoval || isNumericOnly) {
            const rawTarget = cleanAdminText.replace(/^(?:remove|delete|del|exclude)\s*/i, '').trim();
            if (!rawTarget) {
              activeCampaign.isAwaitingRemoval = true;
              await sock.sendMessage(senderJid, {
                text:
                  `❌ *Remove Numbers from Audience*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Reply with the list item number(s) or phone number(s) to exclude.\n\n` +
                  `• *By Number:* reply \`2\` or \`1, 3\`\n` +
                  `• *By Phone:* reply \`+91 9233052856\`\n\n` +
                  `_Or reply *cancel* to return to the audience review card._`,
              });
              return;
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
                adminJid: senderJid,
                campaign: activeCampaign,
                noticeText: `✅ *Removed ${removedCount} contact(s) from campaign audience.*`,
              });
              return;
            } else if (activeCampaign.isAwaitingRemoval) {
              await sock.sendMessage(senderJid, {
                text: `⚠️ *No matching contacts found to remove.*\nReply with a valid number from the list (1 to ${activeCampaign.recipients.length}) or a 10-digit phone number, or reply *cancel*.`,
              });
              return;
            }
          }
        }

        // Targeted or Automated Discovery: "@send 24 hour", "send 24 hour", "24 hour", "24h", "today", "@send <numbers>"
        const isCampaignDiscoveryIntent =
          isAdmin && (
            lowerText.startsWith('@send') ||
            lowerText.startsWith('send ') ||
            lowerText.startsWith('@campaign') ||
            lowerText.startsWith('campaign ') ||
            lowerText === '@send' ||
            /^(?:@?send\s+)?(?:\d+\s*(?:hours?|hrs?|h|days?|d|weeks?|w)|today)$/i.test(trimmedText)
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
            adminCampaignState.set(senderJid, campaign);
            adminCampaignState.set(normalizedJid, campaign);

            await sendCampaignReviewCard({ sock, adminJid: senderJid, campaign });
            return;
          }

          // Otherwise, it is an automated timeframe scan (e.g. "@send 24 hour", "24 hour", "12h", "7d", "today")
          const tf = parseTimeframeHours(rawArg);
          await sock.sendMessage(senderJid, {
            text: `🔍 *Scanning active students from the past ${tf.label}...*\n_Searching activity logs, kiosk orders, and chat sessions..._`,
          });

          const activeStudents = await getActiveStudentsInTimeframe(tf.hours, sock);

          if (activeStudents.length === 0) {
            await sock.sendMessage(senderJid, {
              text:
                `ℹ️ *No active student contacts found in the past ${tf.label}.*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `None of the students who messaged recently were within the last ${tf.label}.\n\n` +
                `💡 *What you can do:*\n` +
                `• Expand search window: reply \`@send 7d\` or \`@send 30d\`\n` +
                `• Or target specific phone numbers directly:\n` +
                `  \`@send 9863013886, 9362980761\``,
            });
            return;
          }

          const campaign = {
            timeframeLabel: tf.label,
            hours: tf.hours,
            recipients: activeStudents,
            isAwaitingRemoval: false,
            timestamp: Date.now(),
          };
          adminCampaignState.set(senderJid, campaign);
          adminCampaignState.set(normalizedJid, campaign);

          await sendCampaignReviewCard({ sock, adminJid: senderJid, campaign });
          return;
        }

        // Student & Confidential Dossier Commands (@student, @find student, student, phone, dossier, buttons, Razorpay)
        const isStudentExplicit =
          buttonId?.startsWith('view_student_') ||
          buttonId?.startsWith('unlock_') ||
          buttonId?.startsWith('search_ex_') ||
          buttonId?.startsWith('btn_pay_') ||
          buttonId === 'btn_flow_student' ||
          /^[@!#]?(student|phone|dossier|find\s+student|search\s+student)/i.test(rawText.trim()) ||
          rawText.trim().toLowerCase() === 'student' ||
          rawText.trim().toLowerCase() === 'directory';

        const isStudentMenuChoice =
          (!session || session.stage === 'COMPLETED') &&
          (rawText.trim().toLowerCase() === '2');

        const isUnlockOrPay =
          rawText.trim().toLowerCase() === 'unlock' ||
          rawText.trim().toLowerCase() === '3' ||
          rawText.trim().toLowerCase() === '119';

        const isStudentTrigger = isStudentExplicit || isStudentMenuChoice || isUnlockOrPay;

        if (isStudentTrigger && (!session || session.stage === 'COMPLETED' || isStudentTrigger)) {
          try {
            const resolvedUserPhone = await resolveUserPhone(sock, senderJid);
            const handled = await handleStudentMessage({
              sock,
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
        // 2. BUTTON CLICKS PROCESSING
        // ======================================================================
        if (buttonId) {
          if (buttonId === 'btn_campaign_send') {
            const campaign = adminCampaignState.get(senderJid) || adminCampaignState.get(normalizedJid);
            if (!campaign) {
              await sock.sendMessage(senderJid, { text: `ℹ️ No active campaign found. Type *@send 24 hour* to start one.` });
              return;
            }
            adminCampaignState.delete(senderJid);
            adminCampaignState.delete(normalizedJid);
            await executeCampaignBroadcast({ sock, adminJid: senderJid, campaign });
            return;
          }

          if (buttonId === 'btn_campaign_remove_prompt') {
            const campaign = adminCampaignState.get(senderJid) || adminCampaignState.get(normalizedJid);
            if (!campaign) {
              await sock.sendMessage(senderJid, { text: `ℹ️ No active campaign found. Type *@send 24 hour* to start one.` });
              return;
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
            return;
          }

          if (buttonId === 'btn_campaign_cancel') {
            adminCampaignState.delete(senderJid);
            adminCampaignState.delete(normalizedJid);
            await sock.sendMessage(senderJid, {
              text: `🚫 *Campaign Broadcast Cancelled.*\nNo promotional messages were dispatched. Active list cleared.`,
            });
            return;
          }

          if (buttonId === 'btn_campaign_cancel_remove') {
            const campaign = adminCampaignState.get(senderJid) || adminCampaignState.get(normalizedJid);
            if (campaign) {
              campaign.isAwaitingRemoval = false;
              await sendCampaignReviewCard({ sock, adminJid: senderJid, campaign });
            }
            return;
          }

          if (buttonId === 'btn_flow_student') {
            const resolvedUserPhone = await resolveUserPhone(sock, senderJid);
            await handleStudentMessage({
              sock,
              msg,
              rawBody: '',
              lowerBody: '',
              buttonId: 'btn_flow_student',
              senderJid,
              sendInteractiveButtons,
              razorpay,
              userPhone: resolvedUserPhone,
            });
            return;
          }
          if (buttonId === 'btn_flow_printing') {
            const displayName = senderName && senderName !== 'Student' ? ` ${senderName}` : '';
            const onboardingPrompt =
              `*PrintKurox AutoPrint* · Fast Campus Printing\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `👋 Hello${displayName}! Welcome to automated instant printing.\n\n` +
              `🔥 *SPECIAL VOLUME OFFER (10+ Pages):*\n` +
              `⚫ *B&W Single Page:* *₹3 / page* _(Save 25%)_\n` +
              `🎨 *Color Single Page:* *₹5 / page* _(Save 28%)_\n` +
              `⚠️ _Note: Volume offer applies strictly to single-sided (single page) printing._\n\n` +
              `📄 *Standard Rates (1–9 pages):*\n` +
              `• B&W Single: ₹4/page\n` +
              `• Color Single: ₹7/page\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `📎 *To Print:* Just send or forward your *PDF*, *Document*, or *Photo* here!\n` +
              `📚 *Multiple Files?* Send them one by one to combine into a single print job.\n\n` +
              `📍 *Release Station:* ${STATION_NAME} (${STATION_ROOM})\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `_Send your file now to start!_`;
            await sock.sendMessage(senderJid, { text: onboardingPrompt });
            return;
          }
          // Session Expiration Guard
          if (session && isSessionExpired(session) && session.stage !== 'COMPLETED') {
            userSessions.delete(senderJid);
            userSessions.delete(normalizedJid);
            await sendSessionExpiredMessage(sock, senderJid);
            return;
          }

          // --- QUEUE STAGING BUTTON: ADD MORE FILES ---
          if (buttonId === 'btn_queue_add_more') {
            if (!session || !session.queuedFiles || session.queuedFiles.length === 0) {
              await sock.sendMessage(senderJid, {
                text: `📎 *Please forward or attach a PDF or photo to start!*`,
              });
              return;
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
            return;
          }

          // --- QUEUE STAGING BUTTON: CONTINUE TO PRINT ---
          if (buttonId === 'btn_queue_continue') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
            }
            await continueWithQueuedFiles({ sock, senderJid, session, senderName });
            return;
          }

          // --- QUEUE STAGING BUTTON: CLEAR QUEUE ---
          if (buttonId === 'btn_queue_clear') {
            if (session) {
              if (session.jobId && activePollers.has(session.jobId)) {
                clearInterval(activePollers.get(session.jobId));
                activePollers.delete(session.jobId);
              }
              session.queuedFiles = [];
              userSessions.delete(senderJid);
              userSessions.delete(normalizedJid);
            }
            await sock.sendMessage(senderJid, {
              text:
                `🗑️ *Print Queue Cleared*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Your print queue has been emptied.\n` +
                `Whenever you're ready, forward or send any document or photo to start fresh!`,
            });
            return;
          }

          // --- STEP 1 BUTTON: COLOR SELECTION ---
          if (buttonId === 'btn_bw' || buttonId === 'btn_color') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
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
            return;
          }

          // --- STEP 2 BUTTON: PAGE SELECTION (ALL vs CUSTOM) ---
          if (buttonId === 'btn_pages_all') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
            }
            session.selectedPages = Array.from({ length: session.totalPages }, (_, i) => i + 1);
            session.pageRangeStr = 'All';
            session.timestamp = Date.now();
            console.log(`[WA-Bot] ${senderName} selected All Pages, advancing to Copies`);
            await sendStep3CopiesButtons(sock, senderJid, session);
            return;
          }

          if (buttonId === 'btn_pages_custom') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
            }
            session.stage = 'AWAITING_CUSTOM_RANGE';
            session.timestamp = Date.now();
            await sock.sendMessage(senderJid, {
              text:
                `📑 *Custom Page Range:*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Total pages in file: *${session.totalPages}*\n\n` +
                `Reply with the pages you want to print, e.g.:\n` +
                `• *1-5* (pages 1 to 5)\n` +
                `• *1, 3, 5* (specific pages)\n` +
                `• *odd* or *even*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            });
            return;
          }

          // --- STEP 3 BUTTON: COPIES SELECTION ---
          if (buttonId === 'btn_copies_custom') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
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
            return;
          }

          if (buttonId.startsWith('btn_copies_')) {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
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
            return;
          }

          // --- BUTTON: VIEW PREVIEW ---
          if (buttonId === 'btn_view_preview') {
            await sendDocumentVisualPreview({ sock, senderJid, senderName, session });
            return;
          }

          // --- BUTTON: PROCEED TO PAYMENT / PAY NOW ---
          if (buttonId === 'btn_pay_now' || buttonId === 'btn_proceed_payment') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
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
              return;
            }
            console.log(`[WA-Bot] ${senderName} tapped pay now, re-dispatching 1-Tap UPI Card`);
            await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
            return;
          }

          // --- RESET / CHANGE SETTINGS BUTTON ---
          if (buttonId === 'btn_reset') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
            }
            if (session.jobId && activePollers.has(session.jobId)) {
              clearInterval(activePollers.get(session.jobId));
              activePollers.delete(session.jobId);
            }
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

            console.log(`[WA-Bot] ${senderName} tapped RESET / CHANGE. Re-dispatching Queue Staging.`);
            if (session.queuedFiles && session.queuedFiles.length > 0) {
              await sendQueueStagingCard({ sock, senderJid, session });
            } else if (session.fileName) {
              await sendStep1Buttons(sock, senderJid, session.fileName, session.totalPages, session.fileSizeMb);
            }
            return;
          }

          // --- STEP 5 PAYMENT: CASH BUTTON ---
          if (buttonId === 'btn_pay_cash') {
            await handleCashOrder({ sock, senderJid, session });
            return;
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
              return;
            }
          }
        }

        // ======================================================================
        // 3. INCOMING TEXT REPLY (TYPED FALLBACK / STATIONS / CASH / HELP)
        // ======================================================================
        const textMsg =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          buttonText ||
          '';

        if (textMsg && !isGroup) {
          const clean = textMsg.trim().toLowerCase();

          // Session Expiration Guard for typed input
          if (session && isSessionExpired(session) && session.stage !== 'COMPLETED') {
            userSessions.delete(senderJid);
            userSessions.delete(normalizedJid);
            await sendSessionExpiredMessage(sock, senderJid);
            return;
          }

          // --- UNIVERSAL CANCEL / STOP COMMAND ---
          if (/^(cancel|stop|abort|exit|quit|clear|end|cancel\s+order)$/i.test(clean)) {
            if (session) {
              if (session.jobId && activePollers.has(session.jobId)) {
                clearInterval(activePollers.get(session.jobId));
                activePollers.delete(session.jobId);
              }
              if (session.queuedFiles) session.queuedFiles = [];
              userSessions.delete(senderJid);
              userSessions.delete(normalizedJid);
            }
            await sock.sendMessage(senderJid, {
              text:
                `❌ *Print Order Cancelled*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Your active print session and queue have been cleared.\n` +
                `No payment has been charged.\n\n` +
                `_Whenever you're ready, simply send or forward a new document or photo to start fresh!_`,
            });
            return;
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
              return;
            }

            if (clean === 'continue' || clean === 'done' || clean === 'print' || clean === 'next' || clean === 'ok' || clean === 'proceed') {
              await continueWithQueuedFiles({ sock, senderJid, session, senderName });
              return;
            }

            if (clean === 'clear' || clean === 'cancel' || clean === 'cancel queue' || clean === 'clear queue' || clean === 'empty' || clean === 'delete' || clean === 'stop' || clean === 'quit' || clean === 'exit') {
              if (session) {
                session.queuedFiles = [];
                userSessions.delete(senderJid);
                userSessions.delete(normalizedJid);
              }
              await sock.sendMessage(senderJid, {
                text: `🗑️ *Print queue cleared!* Forward or send a new document to start fresh.`,
              });
              return;
            }

            if (clean === 'queue' || clean === 'files' || clean === 'list') {
              await sendQueueStagingCard({ sock, senderJid, session });
              return;
            }
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
            return;
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
                return;
              } else if (session.fileName) {
                await sendStep1Buttons(sock, senderJid, session.fileName, session.totalPages, session.fileSizeMb);
                return;
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
                return;
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
            return;
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
              return;
            } else {
              await sock.sendMessage(senderJid, {
                text: `👉 Please tap an option button above, or reply *1* for *Black & White* or *2* for *Color*.`,
              });
              return;
            }
          }

          // --- TYPED FALLBACK: STEP 2 (PAGE SELECTION & CUSTOM RANGE) ---
          if (session && (session.stage === 'AWAITING_PAGE_SELECTION' || session.stage === 'AWAITING_CUSTOM_RANGE')) {
            let selectedPages = Array.from({ length: session.totalPages }, (_, i) => i + 1);
            let pageRangeStr = 'All';

            if (clean === 'all' || clean === '1' || clean === 'ok' || clean === 'full') {
              selectedPages = Array.from({ length: session.totalPages }, (_, i) => i + 1);
              pageRangeStr = 'All';
            } else if (/\bodd\b/i.test(clean)) {
              selectedPages = [];
              for (let i = 1; i <= session.totalPages; i += 2) selectedPages.push(i);
              pageRangeStr = `Odd (${formatPageRange(selectedPages)})`;
            } else if (/\beven\b/i.test(clean)) {
              selectedPages = [];
              for (let i = 2; i <= session.totalPages; i += 2) selectedPages.push(i);
              pageRangeStr = `Even (${formatPageRange(selectedPages)})`;
            } else {
              const rangeMatch = clean.match(/(?:pages?|p\.?)\s*([0-9\s,-]+)/i) || clean.match(/\b(\d+\s*-\s*\d+)\b/) || clean.match(/^([0-9\s,-]+)$/);
              if (rangeMatch && rangeMatch[1]) {
                const parsed = parsePageRange(rangeMatch[1], session.totalPages);
                if (parsed.length > 0) {
                  selectedPages = parsed;
                  pageRangeStr = formatPageRange(selectedPages);
                }
              }
            }

            session.selectedPages = selectedPages;
            session.pageRangeStr = pageRangeStr;
            session.timestamp = Date.now();
            console.log(`[WA-Bot] ${senderName} specified pages: ${pageRangeStr}, advancing to Copies`);

            await sendStep3CopiesButtons(sock, senderJid, session);
            return;
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
            return;
          }

          // --- TYPED FALLBACK: SUMMARY, PREVIEW & PAYMENT ---
          if (session && (session.stage === 'AWAITING_SUMMARY_CONFIRMATION' || session.stage === 'AWAITING_PAYMENT')) {
            if (clean.includes('preview') || clean.includes('view') || clean.includes('show')) {
              await sendDocumentVisualPreview({ sock, senderJid, senderName, session });
              return;
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
                return;
              }
              await sendDocumentSummaryAndPaymentCard({ sock, senderJid, senderName, session });
              return;
            }
          }

          // --- CASH CONFIRMATION (WHEN AWAITING PAYMENT) ---
          if (clean === 'cash' || clean === 'pay cash' || clean === 'counter') {
            await handleCashOrder({ sock, senderJid, session });
            return;
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
              return;
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
              return;
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

          const isPureGreeting = /^(hi|hello|hey|start|menu|options|help|yo|info|hlo|hii|helo)$/i.test(clean);

          if (isPrintGreetingIntent || isPureGreeting) {
            const displayName = senderName && senderName !== 'Student' ? ` ${senderName}` : '';
            await sendInteractiveButtons({
              sock,
              jid: senderJid,
              title: '⚡ NERIST Campus Assistant',
              body: `👋 Hi${displayName}! Welcome to PrintKurox.\n\nPlease choose a service below:`,
              footer: 'PrintKurox AutoPrint',
              buttons: [
                { id: 'btn_flow_printing', text: '🖨️ Printing Service' },
                { id: 'btn_flow_student', text: '🎓 Student Directory' },
              ],
            });
            return;
          }

          // Direct typed choice: "1", "print", "autoprint" -> Direct Printing Onboarding
          if ((clean === '1' || clean === 'print' || clean === 'autoprint') && (!session || session.stage === 'COMPLETED')) {
            const displayName = senderName && senderName !== 'Student' ? ` ${senderName}` : '';
            const onboardingPrompt =
              `*PrintKurox AutoPrint* · Fast Campus Printing\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `👋 Hello${displayName}! Welcome to automated instant printing.\n\n` +
              `🔥 *SPECIAL VOLUME OFFER (10+ Pages):*\n` +
              `⚫ *B&W Single Page:* *₹3 / page* _(Save 25%)\n` +
              `🎨 *Color Single Page:* *₹5 / page* _(Save 28%)\n` +
              `⚠️ _Note: Volume offer applies strictly to single-sided (single page) printing._\n\n` +
              `📄 *Standard Rates (1–9 pages):*\n` +
              `• B&W Single: ₹4/page\n` +
              `• Color Single: ₹7/page\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `📎 *To Print:* Just send or forward your *PDF*, *Document*, or *Photo* here!\n` +
              `📚 *Multiple Files?* Send them all to combine into a single print batch.\n\n` +
              `📍 *Release Station:* ${STATION_NAME} (${STATION_ROOM})\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `_Send your file now to start!_`;

            await sock.sendMessage(senderJid, { text: onboardingPrompt });
            return;
          }

          if (false) {
            

          const isGreetingOrPrintIntent =
            clean.includes('print') ||
            clean.includes('document') ||
            clean.includes('pdf') ||
            clean.includes('photo') ||
            clean.includes('file') ||
            clean.includes('xerox') ||
            clean.includes('price') ||
            clean.includes('rate') ||
            clean.includes('offer') ||
            clean.includes('discount');

          if (!session || session.stage === 'COMPLETED' || isGreetingOrPrintIntent) {
            const displayName = senderName && senderName !== 'Student' ? ` ${senderName}` : '';
            const onboardingPrompt =
              `*PrintKurox AutoPrint* · Fast Campus Printing\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `👋 Hello${displayName}! Welcome to automated instant printing.\n\n` +
              `🔥 *SPECIAL VOLUME OFFER (10+ Pages):*\n` +
              `⚫ *B&W Single Page:* *₹3 / page* _(Save 25%)_\n` +
              `🎨 *Color Single Page:* *₹5 / page* _(Save 28%)_\n` +
              `⚠️ _Note: Volume offer applies strictly to single-sided (single page) printing._\n\n` +
              `📄 *Standard Rates (1–9 pages):*\n` +
              `• B&W Single: ₹4/page\n` +
              `• Color Single: ₹7/page\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `📎 *To Print:* Just send or forward your *PDF*, *Document*, or *Photo* here!\n` +
              `📚 *Multiple Files?* Send them one by one to combine into a single print job.\n\n` +
              `📍 *Release Station:* ${STATION_NAME} (${STATION_ROOM})\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `_Send your file now to start!_`;

            await sock.sendMessage(senderJid, { text: onboardingPrompt });
            return;
          }
            const displayName = senderName && senderName !== 'Student' ? ` ${senderName}` : '';
            const onboardingPrompt =
              `*PrintKurox AutoPrint* · Fast Campus Printing\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `👋 Hello${displayName}! Welcome to automated instant printing.\n\n` +
              `🔥 *SPECIAL VOLUME OFFER (10+ Pages):*\n` +
              `⚫ *B&W Single Page:* *₹3 / page* _(Save 25%)_\n` +
              `🎨 *Color Single Page:* *₹5 / page* _(Save 28%)_\n` +
              `⚠️ _Note: Volume offer applies strictly to single-sided (single page) printing._\n\n` +
              `📄 *Standard Rates (1–9 pages):*\n` +
              `• B&W Single: ₹4/page\n` +
              `• Color Single: ₹7/page\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `📎 *To Print:* Just send or forward your *PDF*, *Document*, or *Photo* here!\n` +
              `📚 *Multiple Files?* Send them one by one to combine into a single print job.\n\n` +
              `📍 *Release Station:* ${STATION_NAME} (${STATION_ROOM})\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `_Send your file now to start!_`;

            await sock.sendMessage(senderJid, { text: onboardingPrompt }, { quoted: msg });
            return;
          }

          // Fallback if session exists but user typed something unhandled
          if (session && session.stage) {
            await sock.sendMessage(senderJid, {
              text: `👉 Please tap an option button above to continue, or forward a new PDF/photo to start fresh!`,
            });
            return;
          }
        }
      }
    } catch (msgErr) {
      console.error('[WA-Bot] Error processing message:', msgErr);
    }
  });
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
