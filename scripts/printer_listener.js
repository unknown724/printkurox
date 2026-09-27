const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PDFDocument } = require('pdf-lib');

require('./load_env');

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT || 'https://948fd75d8b84a5cf20559d6aa789d4dd.r2.cloudflarestorage.com';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'kiosk-uploads';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_D1_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;

const DEFAULT_STATION_ID = 'block_b';

const WATCH_DIR = path.resolve(__dirname, '..', 'temp_print');
const WATCH_FILE = path.join(WATCH_DIR, 'direct_job.pdf');
const QUEUE_DIR = path.join(WATCH_DIR, 'queue');

if (!fs.existsSync(QUEUE_DIR)) {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
}

let isProcessing = false;
let lastProcessedTime = 0;

function waitForFileReady(filePath, maxTries = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      try {
        const fd = fs.openSync(filePath, 'r+');
        fs.closeSync(fd);
        clearInterval(interval);
        resolve(true);
      } catch (err) {
        if (tries >= maxTries) {
          clearInterval(interval);
          reject(new Error('File lock timeout'));
        }
      }
    }, 200);
  });
}

async function handlePrintJob(jobPdfPath) {
  try {
    const stats = fs.statSync(jobPdfPath);
    if (stats.size < 500) {
      // Too small / empty file
      return;
    }

    console.log(`\n[${new Date().toLocaleTimeString()}] >>> New Ctrl+P Print Job Detected! (${(stats.size / 1024).toFixed(1)} KB)`);

    const fileBuffer = fs.readFileSync(jobPdfPath);
    let totalPages = 1;
    try {
      const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
      totalPages = pdfDoc.getPageCount();
    } catch (e) {
      console.warn('Could not parse page count, defaulting to 1');
    }

    const fileName = `Document_CtrlP_${Date.now()}.pdf`;
    const fileKey = `ctrlp_${Date.now()}_job.pdf`;

    console.log(`[1/3] Uploading ${totalPages}-page document to print cloud...`);
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileKey,
      Body: fileBuffer,
      ContentType: 'application/pdf',
    }));

    console.log('[2/3] Dispatching print command to Roommate EPSON L3210...');
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const pickupCode = `#C${Math.floor(100 + Math.random() * 900)}`;

    const sql = `INSERT INTO print_jobs (
      id, pickup_code, file_key, file_name, total_pages, page_range,
      color_mode, is_duplex, copies, duplex_sheets, single_sheets,
      total_price, order_id, payment_id, status, created_at, expires_at,
      orientation, station_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      jobId,
      pickupCode,
      fileKey,
      fileName,
      totalPages,
      'All',
      'bw',
      0,
      1,
      0,
      totalPages,
      0,
      'DIRECT_CTRL_P',
      `SERVER_DIRECT_${Date.now()}`,
      'PAID',
      now,
      expiresAt,
      'portrait',
      DEFAULT_STATION_ID,
    ];

    const d1Res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DB_ID}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });

    const d1Data = await d1Res.json();
    if (!d1Data.success) {
      console.error('[ERROR] Failed to register print job:', d1Data.errors);
      return;
    }

    console.log(`[3/3] SUCCESS! Print Job Sent! Code: ${pickupCode}`);
    console.log('Roommate EPSON L3210 will start printing in 2-3 seconds!\n');
    console.log('--- Ready for next Ctrl+P job ---');
  } catch (err) {
    console.error('[ERROR] Failed to process print job:', err);
  }
}

async function checkAndProcess() {
  if (isProcessing) return;
  if (!fs.existsSync(WATCH_FILE)) return;

  try {
    const stats = fs.statSync(WATCH_FILE);
    if (stats.mtimeMs <= lastProcessedTime || stats.size < 500) return;

    isProcessing = true;
    lastProcessedTime = stats.mtimeMs;

    // Wait until spooler finished writing
    await waitForFileReady(WATCH_FILE);

    // Copy to queue
    const queuedFile = path.join(QUEUE_DIR, `job_${Date.now()}.pdf`);
    fs.copyFileSync(WATCH_FILE, queuedFile);

    // Process job
    await handlePrintJob(queuedFile);
  } catch (err) {
    // Spooler still writing or other transient error
  } finally {
    isProcessing = false;
  }
}

console.log('============================================================');
console.log('    ROOMMATE EPSON L3210 NATIVE CTRL+P PRINTER LISTENER     ');
console.log('============================================================');
console.log(`Printer Name: "Roommate EPSON L3210"`);
console.log(`Status:       LISTENING for Ctrl+P jobs from any app...`);
console.log('============================================================\n');

// Poll every 1 second
setInterval(checkAndProcess, 1000);
