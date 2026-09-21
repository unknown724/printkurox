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

// Configuration from .env
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'kiosk-uploads';
const PUBLIC_KIOSK_URL = process.env.PUBLIC_KIOSK_URL || 'https://printkurox.vercel.app';
const BOT_NAME = process.env.BOT_NAME || 'PrintKurox AutoPrint';

// Campus Stations Registry
const AVAILABLE_STATIONS = [
  { id: 'block_b', name: 'Hostel Block B (Pare)', room: 'Room 29, 1st Floor', contact: '9362980761' },
  { id: 'block_c', name: 'Hostel Block C (Dibang)', room: 'Ground Floor', contact: '9362980761' },
  { id: 'romen_xerox', name: 'Romen Xerox', room: 'Main Gate / Off-Campus', contact: '9362980761' },
];

// Default station auto-detected from station_config.json or environment
let defaultStation = {
  id: process.env.STATION_ID || 'block_b',
  name: process.env.STATION_NAME || 'Hostel Block B (Pare)',
  room: process.env.STATION_ROOM || 'Room 29, 1st Floor',
  contact: process.env.STATION_CONTACT || '9362980761',
};

try {
  const stationConfigPath = path.join(__dirname, '..', 'station_config.json');
  if (fs.existsSync(stationConfigPath)) {
    const rawCfg = JSON.parse(fs.readFileSync(stationConfigPath, 'utf8'));
    if (rawCfg.station_id) defaultStation.id = rawCfg.station_id;
    if (rawCfg.station_name) defaultStation.name = rawCfg.station_name;
    if (rawCfg.room_info) defaultStation.room = rawCfg.room_info;
    if (rawCfg.contact) defaultStation.contact = rawCfg.contact;
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
const STEP1_BUTTONS = [
  { id: 'btn_bw', text: '1️⃣ Black & White (₹4/p)' },
  { id: 'btn_color', text: '2️⃣ Color (₹7/p)' },
];

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

/**
 * Resolve phone number for a sender JID or fallback to kiosk station contact
 */
async function resolveUserPhone(sock, senderJid) {
  if (!senderJid) return STATION_CONTACT;
  if (senderJid.endsWith('@s.whatsapp.net')) {
    const raw = senderJid.split('@')[0].replace(/[^0-9]/g, '');
    if (raw.length >= 10) return raw.slice(-10);
  }
  if (senderJid.endsWith('@lid') && sock?.signalRepository?.lidMapping?.getPNForLID) {
    try {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(senderJid);
      if (pn) {
        const raw = pn.split('@')[0].replace(/[^0-9]/g, '');
        if (raw.length >= 10) return raw.slice(-10);
      }
    } catch (e) {}
  }
  return STATION_CONTACT;
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

/**
 * Dispatch single-card native WhatsApp action buttons (IndiGo-style tap buttons)
 * Injects binary XML envelope (<biz><interactive ...> + <bot ...>)
 */
async function sendInteractiveButtons({ sock, jid, title, body, footer = 'PrintKurox AutoPrint', buttons = [] }) {
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
      jid,
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
      {
        tag: 'bot',
        attrs: { biz_bot: '1' },
      },
    ];

    await sock.relayMessage(jid, waMsg.message, {
      messageId: waMsg.key.id,
      additionalNodes,
    });
    if (waMsg?.key?.id && waMsg?.message) {
      messageStore.set(waMsg.key.id, waMsg.message);
    }
    return waMsg;
  } catch (btnErr) {
    console.warn('[WA-Bot] sendInteractiveButtons notice:', btnErr.message);
    return null;
  }
}

/**
 * Dispatch Step 1: Color Selection (Single Card, Zero Spam)
 */
async function sendStep1Buttons(sock, senderJid, fileName, totalPages, fileSizeMb) {
  const title = `*PrintKurox* · Color Selection`;
  const body =
    `📄 *File:* ${fileName}\n` +
    `📊 *Pages:* ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} (${fileSizeMb} MB)\n` +
    `📍 *Station:* ${defaultStation.name} (${defaultStation.room})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Select print color below:`;

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title,
    body,
    footer: 'PrintKurox AutoPrint',
    buttons: STEP1_BUTTONS,
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
  const modeLabel = session.colorMode === 'color' ? 'Color (₹7/p)' : 'Black & White (₹4/p)';
  const pagesLabel = session.pageRangeStr || `All (${session.totalPages}p)`;
  const title = `*PrintKurox* · Number of Copies`;
  const body =
    `📄 *File:* ${session.fileName}\n` +
    `📑 *Pages:* ${pagesLabel}\n` +
    `🖨️ *Mode:* ${modeLabel}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Select copies below, or reply with any number (e.g. *5*, *10*):`;

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
async function sendDocumentSummaryCard(sock, senderJid, session) {
  const activePagesCount = session.selectedPages ? session.selectedPages.length : session.totalPages;
  const currentStation = session.station || defaultStation;
  const ratePerPage = session.colorMode === 'color' ? 7 : 4;
  const subtotal = activePagesCount * ratePerPage;
  const totalAmount = Math.max(1, subtotal * (session.copies || 1));
  session.totalPrice = totalAmount;

  // Natural orientation: follows uploaded file's geometry directly
  const isLandscape = session.isLandscapeDefault;
  session.orientation = isLandscape ? 'landscape' : 'portrait';
  const orientLabel = isLandscape ? 'Landscape (Wide)' : 'Portrait (Vertical)';
  const printTypeLabel = session.colorMode === 'color' ? 'Color' : 'Black & White';

  const summaryBody =
    `📄 *Document:* ${session.fileName}\n` +
    `🖨️ *Print Mode:* ${printTypeLabel} (₹${ratePerPage}/p)\n` +
    `📑 *Pages:* ${session.pageRangeStr || 'All'} (${activePagesCount} of ${session.totalPages})\n` +
    `🔢 *Copies:* ${session.copies || 1} ${session.copies === 1 ? 'copy' : 'copies'}\n` +
    `📐 *Orientation:* ${orientLabel} (Natural)\n` +
    `📍 *Pickup Station:* ${currentStation.name} (${currentStation.room})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💳 *Total Payable:* *₹${totalAmount}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Verify your settings to proceed:`;

  session.stage = 'AWAITING_SUMMARY_CONFIRMATION';

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title: '*PrintKurox* · Order Summary',
    body: summaryBody,
    footer: 'PrintKurox AutoPrint',
    buttons: SUMMARY_CONFIRM_BUTTONS,
  });
}

/**
 * Dispatch Step 5: Dedicated Payment Card (Online UPI vs Cash at Counter)
 */
async function sendDedicatedPaymentCard({ sock, senderJid, senderName, session }) {
  const currentStation = session.station || defaultStation;
  const totalAmount = session.totalPrice;
  const pickupCode = generateRandomPickupCode();
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  let paymentLinkUrl = '';
  let paymentLinkId = '';

  // Auto-resolve phone number for Razorpay to skip phone input screen
  const prefillPhone = await resolveUserPhone(sock, senderJid);

  if (razorpay) {
    try {
      const rzpLink = await razorpay.paymentLink.create({
        amount: totalAmount * 100,
        currency: 'INR',
        accept_partial: false,
        description: `Print: ${session.fileName.slice(0, 30)} (${session.copies || 1}x, ${session.colorMode}, ${session.orientation || 'portrait'})`,
        customer: {
          name: senderName || 'Student',
          contact: prefillPhone,
        },
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
      console.log(`[WA-Bot] Razorpay link created (contact: ${prefillPhone}): ${paymentLinkUrl}`);
    } catch (rzpErr) {
      console.error('[WA-Bot] Razorpay link creation error:', rzpErr);
    }
  }

  // Ensure background R2 upload has fully settled before creating order
  if (session.uploadPromise) {
    try {
      await session.uploadPromise;
    } catch (upErr) {
      console.warn('[WA-Bot] Upload promise wait notice:', upErr.message);
    }
  }

  // Save order to Cloudflare D1
  await executeD1(
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
  );

  session.stage = 'AWAITING_PAYMENT';
  session.jobId = jobId;
  session.pickupCode = pickupCode;
  session.paymentLinkId = paymentLinkId;

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

  const paymentCardBody =
    `📄 *Order:* ${session.fileName}\n` +
    `💰 *Total Amount:* *₹${totalAmount}*\n` +
    `📍 *Release Station:* ${currentStation.name} (${currentStation.room})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Choose your payment option:`;

  const paymentButtons = [];
  if (paymentLinkUrl) {
    paymentButtons.push({
      text: `💳 Pay ₹${totalAmount} Online (UPI)`,
      url: paymentLinkUrl,
    });
  }
  paymentButtons.push({
    id: 'btn_pay_cash',
    text: '💵 Pay Cash at Counter',
  });

  await sendInteractiveButtons({
    sock,
    jid: senderJid,
    title: '*PrintKurox* · Payment Method',
    body: paymentCardBody,
    footer: 'PrintKurox AutoPrint',
    buttons: paymentButtons,
  });

  console.log(`[WA-Bot] Sent Step 5 Dedicated Payment Card to ${senderName} (Total: ₹${totalAmount})`);
}

/**
 * Monitor a pending Razorpay Payment Link every 3 seconds for 5 minutes
 */
function monitorPaymentLink({ sock, senderJid, paymentLinkId, jobId, pickupCode, fileName }) {
  if (!razorpay || !paymentLinkId) return;

  if (activePollers.has(jobId)) {
    clearInterval(activePollers.get(jobId));
    activePollers.delete(jobId);
  }

  const startTime = Date.now();
  const maxDurationMs = 5 * 60 * 1000;

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

        const confirmMsg =
          `*PrintKurox* · Payment Confirmed\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `✅ Payment Verified (₹${session.totalPrice || 0} via UPI)\n\n` +
          `🔑 *PICKUP CODE:*\n` +
          `👉  *【 ${pickupCode} 】*\n\n` +
          `📄 *Document:* ${fileName}\n` +
          `📍 *Location:* ${currentStation.name} (${currentStation.room})\n` +
          `⚡ *Status:* Queued for immediate print\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `*Pickup Steps:*\n` +
          `1. Walk to the kiosk terminal at ${currentStation.room}.\n` +
          `2. Enter code *${pickupCode}* on the screen.\n` +
          `3. Your pages will print automatically.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `_Need help? Call operator: +91 ${STATION_CONTACT}_`;

        await sock.sendMessage(senderJid, { text: confirmMsg });
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

  if (session.uploadPromise) {
    try {
      await session.uploadPromise;
    } catch (upErr) {
      console.warn('[WA-Bot] Upload promise wait notice in cash order:', upErr.message);
    }
  }

  const currentStation = session.station || defaultStation;
  session.stage = 'COMPLETED';

  fetch('http://127.0.0.1:7250/poll-now', { signal: AbortSignal.timeout(300) }).catch(() => {});

  const cashReceiptMsg =
    `*PrintKurox* · Cash Order Registered\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
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
    `_This code remains valid for 30 minutes._`;

  await sock.sendMessage(senderJid, { text: cashReceiptMsg });
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
 * Ingestion Debounce Processor: Merges multi-file batches into a single unified print job
 */
async function processBufferedFiles({ sock, senderJid, normalizedJid, senderName }) {
  const entry = incomingFileBuffers.get(normalizedJid);
  if (!entry || entry.files.length === 0) return;
  const files = [...entry.files];
  incomingFileBuffers.delete(normalizedJid);

  let finalBuffer = null;
  let finalFileName = '';
  let finalMimeType = 'application/pdf';
  let totalPages = 1;
  let isLandscapeDefault = false;
  let isMergedBatch = false;

  if (files.length === 1) {
    const file = files[0];
    finalBuffer = file.buffer;
    finalFileName = file.fileName;
    finalMimeType = file.mimeType;

    if (file.isPdf) {
      try {
        const pdfDoc = await PDFDocument.load(finalBuffer, { ignoreEncryption: true });
        totalPages = pdfDoc.getPageCount();
        const firstPage = pdfDoc.getPages()[0];
        if (firstPage) {
          const { width, height } = firstPage.getSize();
          isLandscapeDefault = width > height;
        }
      } catch (err) {
        totalPages = 1;
      }
    } else if (file.isImg) {
      totalPages = 1;
      isLandscapeDefault = detectImageLandscape(finalBuffer);
    }
  } else {
    // Multi-file batch! Merge all files into 1 clean A4 PDF document
    isMergedBatch = true;
    console.log(`[WA-Bot] 📦 Multi-file batch: Merging ${files.length} items for ${senderName}`);

    try {
      const mergedPdf = await PDFDocument.create();

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.isPdf) {
          try {
            const srcDoc = await PDFDocument.load(f.buffer, { ignoreEncryption: true });
            const indices = srcDoc.getPageIndices();
            const copiedPages = await mergedPdf.copyPages(srcDoc, indices);
            for (const p of copiedPages) {
              mergedPdf.addPage(p);
            }
          } catch (pdfErr) {
            console.warn(`[WA-Bot] Could not append PDF item ${i + 1}:`, pdfErr.message);
          }
        } else if (f.isImg) {
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
      finalFileName = `Merged_${files.length}_items.pdf`;
      finalMimeType = 'application/pdf';
      isLandscapeDefault = false;
    } catch (mergeErr) {
      console.error('[WA-Bot] Batch merge failed, falling back to first item:', mergeErr);
      finalBuffer = files[0].buffer;
      finalFileName = files[0].fileName;
      finalMimeType = files[0].mimeType;
      totalPages = 1;
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

  const newSession = {
    stage: 'AWAITING_COLOR_MODE',
    fileKey: r2Key,
    fileName: finalFileName,
    totalPages,
    fileSizeMb,
    mimeType: finalMimeType,
    isLandscapeDefault,
    orientation: isLandscapeDefault ? 'landscape' : 'portrait',
    station: defaultStation,
    senderJid,
    senderName,
    timestamp: Date.now(),
    imageBuffer: (!isMergedBatch && finalMimeType.startsWith('image/')) ? finalBuffer : null,
    isMergedBatch,
    batchCount: files.length,
    uploadPromise: r2UploadPromise,
  };

  userSessions.set(senderJid, newSession);
  userSessions.set(normalizedJid, newSession);

  if (isMergedBatch) {
    await sock.sendMessage(senderJid, {
      text:
        `📦 *Batch Received: Auto-Merged ${files.length} Files into 1 Document!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📑 Total Pages: *${totalPages}*\n` +
        `💾 File Size: *${fileSizeMb} MB*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Your files are combined into one print job so you pay and pick up in one go!_`,
    });
  }

  await sendStep1Buttons(sock, senderJid, finalFileName, totalPages, fileSizeMb);
  console.log(`[WA-Bot] Dispatched Step 1 Action Buttons instantly to ${senderName} for ${finalFileName} (${totalPages}p)`);
}

// ============================================================================
// MAIN BAILEYS WHATSAPP BOT DAEMON
// ============================================================================

async function startBot() {
  const authDir = path.join(__dirname, 'session_auth');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`[WA-Bot] Using Baileys version ${version.join('.')} (isLatest: ${isLatest})`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['PrintKurox Kiosk', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    getMessage: async (key) => {
      return messageStore.get(key.id);
    },
  });

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

        // Ignore regular outgoing messages from ourselves unless it was a test
        if (msg.key.fromMe) continue;

        // Acknowledge read receipt asynchronously to keep connection responsive
        sock.readMessages([msg.key]).catch(() => {});

        let session = userSessions.get(senderJid) || userSessions.get(normalizedJid);
        if (session) session.senderName = senderName;

        // ======================================================================
        // 1. INCOMING FILE (PDF / IMAGE / DOCUMENT)
        // ======================================================================
        const documentMsg = msg.message.documentMessage;
        const imageMsg = msg.message.imageMessage;

        if (documentMsg || imageMsg) {
          console.log(`[WA-Bot] Media attachment received from ${senderName} (${senderJid})`);

          // Non-blocking reaction & typing indicator for zero-delay user feedback
          sock.sendMessage(senderJid, {
            react: { text: '⏳', key: msg.key },
          }).catch(() => {});
          sock.sendPresenceUpdate('composing', senderJid).catch(() => {});

          let buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            {
              logger: pino({ level: 'silent' }),
              reuploadRequest: sock.updateMediaMessage,
            }
          );

          if (!buffer || buffer.length === 0) {
            await sock.sendMessage(senderJid, {
              text: `⚠️ Sorry ${senderName}, failed to download your file. Please try resending.`,
            });
            return;
          }

          let fileName =
            documentMsg?.fileName ||
            (imageMsg ? `photo_${Date.now().toString().slice(-4)}.jpg` : 'document.pdf');
          let mimeType =
            documentMsg?.mimetype ||
            (imageMsg ? 'image/jpeg' : 'application/pdf');

          // Local Word (.docx / .doc) conversion
          if (fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc')) {
            console.log(`[WA-Bot] Word document detected: ${fileName}. Checking local converter...`);
            const convertedPdf = await convertDocxToPdf(buffer, fileName);
            if (convertedPdf) {
              buffer = convertedPdf;
              fileName = fileName.replace(/\.docx?$/i, '.pdf');
              mimeType = 'application/pdf';
              console.log(`[WA-Bot] Converted Word document locally: ${fileName}`);
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
              );
              return;
            }
          }

          // Ingestion Debounce Buffer: Collect all attachments in this batch
          if (!incomingFileBuffers.has(normalizedJid)) {
            incomingFileBuffers.set(normalizedJid, {
              files: [],
              timer: null,
            });
          }
          const entry = incomingFileBuffers.get(normalizedJid);
          entry.files.push({
            buffer,
            fileName,
            mimeType,
            isImg: !!imageMsg || mimeType.startsWith('image/'),
            isPdf: fileName.toLowerCase().endsWith('.pdf') || mimeType.includes('pdf'),
          });

          // Fast adaptive debounce: 250ms for single docs (PDF/Word), 500ms for photos (merging burst)
          const isSingleDoc = !!documentMsg || fileName.toLowerCase().endsWith('.pdf') || fileName.toLowerCase().endsWith('.docx');
          const debounceDelay = isSingleDoc ? 250 : 500;

          if (entry.timer) clearTimeout(entry.timer);
          entry.timer = setTimeout(async () => {
            try {
              await processBufferedFiles({ sock, senderJid, normalizedJid, senderName });
            } catch (err) {
              console.error('[WA-Bot] Error processing buffered files:', err);
            }
          }, debounceDelay);

          return;
        }

        // ======================================================================
        // 2. BUTTON CLICKS PROCESSING
        // ======================================================================
        if (buttonId) {
          // Session Expiration Guard
          if (session && isSessionExpired(session) && session.stage !== 'COMPLETED') {
            userSessions.delete(senderJid);
            userSessions.delete(normalizedJid);
            await sendSessionExpiredMessage(sock, senderJid);
            return;
          }

          // --- STEP 1 BUTTON: COLOR SELECTION ---
          if (buttonId === 'btn_bw' || buttonId === 'btn_color') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
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

            console.log(`[WA-Bot] ${senderName} selected ${copies} ${copies === 1 ? 'Copy' : 'Copies'}, advancing to Step 4 Summary`);
            await sendDocumentSummaryCard(sock, senderJid, session);
            return;
          }

          // --- STEP 4 BUTTON: VIEW PREVIEW ---
          if (buttonId === 'btn_view_preview') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
            }
            const activePagesCount = session.selectedPages ? session.selectedPages.length : session.totalPages;
            const orientLabel = session.orientation === 'landscape' ? 'Landscape (Wide)' : 'Portrait (Vertical)';
            const colorLabel = session.colorMode === 'color' ? '🎨 Color' : '⚫ Black & White';

            if (session.imageBuffer) {
              await sock.sendMessage(senderJid, {
                image: session.imageBuffer,
                caption:
                  `📄 *Print Preview:*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `📐 *Orientation:* ${orientLabel} (Natural)\n` +
                  `🖨️ *Print Mode:* ${colorLabel}\n` +
                  `📑 *Pages:* ${session.pageRangeStr || 'All'}\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `_Tap "Proceed to Payment" above to print!_`,
              });
            } else {
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
                  `🔍 *Tap below to view full 2-column preview:*\n` +
                  `${previewUrl}\n\n` +
                  `_Tap "Proceed to Payment" above to print!_`,
              });
            }
            return;
          }

          // --- STEP 4 BUTTON: PROCEED TO PAYMENT ---
          if (buttonId === 'btn_proceed_payment') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
            }
            console.log(`[WA-Bot] ${senderName} confirmed summary, sending Step 5 Payment Options`);
            await sendDedicatedPaymentCard({ sock, senderJid, senderName, session });
            return;
          }

          // --- RESET / CHANGE SETTINGS BUTTON ---
          if (buttonId === 'btn_reset') {
            if (!session) {
              await sendSessionExpiredMessage(sock, senderJid);
              return;
            }
            session.stage = 'AWAITING_COLOR_MODE';
            session.colorMode = null;
            session.copies = 1;
            session.selectedPages = null;
            session.pageRangeStr = 'All';
            session.timestamp = Date.now();

            console.log(`[WA-Bot] ${senderName} tapped RESET / CHANGE. Re-dispatching Step 1.`);
            await sendStep1Buttons(sock, senderJid, session.fileName, session.totalPages, session.fileSizeMb);
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
              userSessions.delete(senderJid);
              userSessions.delete(normalizedJid);
            }
            await sock.sendMessage(senderJid, {
              text:
                `❌ *Print Order Cancelled*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Your active print session has been cleared.\n` +
                `No payment has been charged.\n\n` +
                `_Whenever you're ready, simply send or forward a new document or photo to start fresh!_`,
            });
            return;
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
                `2. Choose Color, Pages, and Copies.\n` +
                `3. Pay via UPI or Cash at counter.\n` +
                `4. Enter your Pickup Code on the printer screen!\n\n` +
                `_Tip: Send multiple photos together to auto-merge them into 1 document._`,
            });
            return;
          }

          // --- RESET COMMAND ---
          if (clean === 'reset' || clean === 'restart' || clean === 'change') {
            if (session && session.fileKey) {
              session.stage = 'AWAITING_COLOR_MODE';
              session.colorMode = null;
              session.copies = 1;
              session.orientation = null;
              session.timestamp = Date.now();
              await sendStep1Buttons(sock, senderJid, session.fileName, session.totalPages, session.fileSizeMb);
              return;
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

            console.log(`[WA-Bot] ${senderName} selected ${copies} copies, advancing to Summary`);
            await sendDocumentSummaryCard(sock, senderJid, session);
            return;
          }

          // --- TYPED FALLBACK: STEP 4 (SUMMARY & PREVIEW) ---
          if (session && session.stage === 'AWAITING_SUMMARY_CONFIRMATION') {
            if (clean.includes('preview') || clean.includes('view') || clean.includes('show')) {
              const activePagesCount = session.selectedPages ? session.selectedPages.length : session.totalPages;
              const orientLabel = session.orientation === 'landscape' ? 'Landscape (Wide)' : 'Portrait (Vertical)';
              const colorLabel = session.colorMode === 'color' ? '🎨 Color' : '⚫ Black & White';

              if (session.imageBuffer) {
                await sock.sendMessage(senderJid, {
                  image: session.imageBuffer,
                  caption:
                    `📄 *Print Preview:*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `📐 *Orientation:* ${orientLabel} (Natural)\n` +
                    `🖨️ *Print Mode:* ${colorLabel}\n` +
                    `📑 *Pages:* ${session.pageRangeStr || 'All'}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `_Tap "Proceed to Payment" to print!_`,
                });
              } else {
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
                    `🔍 *Tap below to view full 2-column preview:*\n` +
                    `${previewUrl}\n\n` +
                    `_Tap "Proceed to Payment" to print!_`,
                });
              }
              return;
            }

            if (clean === 'proceed' || clean === 'pay' || clean === 'ok' || clean === 'yes') {
              await sendDedicatedPaymentCard({ sock, senderJid, senderName, session });
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

          // --- UNIVERSAL GREETING, ONBOARDING & FILE UPLOAD PROMPT ---
          // Triggers on greetings, website link messages, 'print', or ANY text when no active session
          const isGreetingOrPrintIntent =
            clean.includes('print') ||
            clean.includes('document') ||
            clean.includes('pdf') ||
            clean.includes('photo') ||
            clean.includes('file') ||
            clean.includes('xerox') ||
            clean === 'hi' ||
            clean === 'hello' ||
            clean === 'hey' ||
            clean === 'help' ||
            clean === 'start' ||
            clean.includes('price') ||
            clean.includes('rate');

          if (!session || session.stage === 'COMPLETED' || isGreetingOrPrintIntent) {
            const displayName = senderName && senderName !== 'Student' ? ` ${senderName}` : '';
            const onboardingPrompt =
              `*PrintKurox AutoPrint*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Hello${displayName}! Welcome to the automated campus print service.\n\n` +
              `📎 *To Print:* Attach or forward your *PDF* or *Photo* here.\n\n` +
              `📍 *Station:* ${STATION_NAME} (${STATION_ROOM})\n` +
              `⚡ *Rates:* B&W ₹4/page · Color ₹7/page\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `_Color, copies, and orientation options will appear as soon as your file arrives._`;

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

startBot();
