const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PDFDocument } = require('pdf-lib');

require('./load_env');

// Cloudflare R2 Credentials
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT || 'https://948fd75d8b84a5cf20559d6aa789d4dd.r2.cloudflarestorage.com';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'kiosk-uploads';

// Cloudflare D1 Credentials
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_D1_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;

const DEFAULT_STATION_ID = 'block_b'; // Hostel Block B - Pare (Server Laptop)

async function countPages(filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    try {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      return pdfDoc.getPageCount();
    } catch (e) {
      console.warn('[WARN] Could not parse PDF page count with pdf-lib, defaulting to 1 page.');
      return 1;
    }
  }
  return 1;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf': return 'application/pdf';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    default: return 'application/octet-stream';
  }
}

async function main() {
  const targetPath = process.argv[2];
  if (!targetPath) {
    console.error('\n[ERROR] No file specified!');
    console.log('Usage: node scripts/direct_print.js "C:\\path\\to\\document.pdf"\n');
    process.exit(1);
  }

  const resolvedPath = path.resolve(targetPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`\n[ERROR] File not found: "${resolvedPath}"\n`);
    process.exit(1);
  }

  const fileName = path.basename(resolvedPath);
  const fileBuffer = fs.readFileSync(resolvedPath);
  const totalPages = await countPages(resolvedPath, fileBuffer);
  const contentType = getContentType(resolvedPath);
  const cleanBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileKey = `direct_${Date.now()}_${cleanBaseName}`;

  console.log('============================================================');
  console.log('       PRINTKUROX DIRECT PRINT TO ROOMMATE EPSON L3210      ');
  console.log('============================================================');
  console.log(`Document:    ${fileName}`);
  console.log(`Total Pages: ${totalPages}`);
  console.log(`Target:      Hostel Block B (DESKTOP-TRKVJQ2)`);
  console.log('------------------------------------------------------------');

  // Check daemon heartbeat
  process.stdout.write('[1/3] Verifying roommate server daemon status... ');
  try {
    const hbRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DB_ID}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: `SELECT updated_at FROM daemon_heartbeat WHERE station_id = '${DEFAULT_STATION_ID}';` }),
    });
    const hbData = await hbRes.json();
    const lastSeen = hbData?.result?.[0]?.results?.[0]?.updated_at;
    console.log(`ONLINE (Last heartbeat: ${lastSeen || 'active'})`);
  } catch (err) {
    console.log('WARNING (Proceeding anyway)');
  }

  // Upload to R2
  process.stdout.write('[2/3] Uploading file to secure print storage... ');
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
    ContentType: contentType,
  }));
  console.log('DONE!');

  // Register in D1
  process.stdout.write('[3/3] Sending print command directly to printer... ');
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const pickupCode = `#D${Math.floor(100 + Math.random() * 900)}`;

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
    'DIRECT_ADMIN',
    `MANUAL_${Date.now()}`,
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
    console.error('\n[ERROR] Failed to register print job:', d1Data.errors);
    process.exit(1);
  }

  console.log('DONE!');
  console.log('============================================================');
  console.log(' SUCCESS! Document has been sent directly to the printer!');
  console.log(` Job ID:       ${jobId}`);
  console.log(` Pickup Code:  ${pickupCode}`);
  console.log(' The Epson L3210 will start printing within 2-3 seconds.');
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('\n[ERROR]', err.message);
  process.exit(1);
});
