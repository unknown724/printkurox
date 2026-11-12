import { NextRequest, NextResponse } from 'next/server';
import { executeD1, queryD1 } from '@/lib/cloudflare-d1';
import { saveStationPricing } from '@/lib/station-pricing';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MASTER_ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || 'Kurox725#29';

// Ensure hardware_devices inventory table exists and is seeded with pilot serials
async function ensureHardwareTable() {
  await executeD1(`
    CREATE TABLE IF NOT EXISTS hardware_devices (
      serial_key TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'unclaimed',
      batch_number TEXT,
      claimed_station_id TEXT,
      claimed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed pilot hardware devices if none exist
  const existing = await queryD1<{ count: number }>(`SELECT COUNT(*) as count FROM hardware_devices`);
  if (!existing || existing.length === 0 || existing[0].count === 0) {
    const pilotKeys = [
      ['KUROX-PRO-8821', 'BATCH-01'],
      ['KUROX-PRO-8822', 'BATCH-01'],
      ['KUROX-PRO-8823', 'BATCH-01'],
      ['KUROX-PRO-8824', 'BATCH-01'],
      ['KUROX-PRO-8825', 'BATCH-01'],
      ['KUROX-PRO-8826', 'BATCH-01'],
      ['KUROX-PRO-8827', 'BATCH-01'],
      ['KUROX-PRO-8828', 'BATCH-01'],
      ['KUROX-PRO-8829', 'BATCH-01'],
      ['KUROX-PRO-8830', 'BATCH-01'],
    ];
    for (const [key, batch] of pilotKeys) {
      await executeD1(
        `INSERT OR IGNORE INTO hardware_devices (serial_key, batch_number, status) VALUES (?, ?, 'unclaimed')`,
        [key, batch]
      );
    }
  }
}

// GET /api/setup-station?verifyKey=KUROX-PRO-8821
export async function GET(req: NextRequest) {
  try {
    await ensureHardwareTable();
    const { searchParams } = new URL(req.url);
    const verifyKey = (searchParams.get('verifyKey') || '').trim().toUpperCase();

    if (!verifyKey) {
      return NextResponse.json({ error: 'Missing serial key parameter.' }, { status: 400 });
    }

    // Master Admin bypass
    if (verifyKey === MASTER_ADMIN_SECRET.toUpperCase() || verifyKey === 'MASTER') {
      return NextResponse.json({
        valid: true,
        serialKey: 'MASTER_OVERRIDE',
        batch: 'ADMIN_PROVISIONING',
        isMaster: true,
      });
    }

    const rows = await queryD1<{ serial_key: string; status: string; batch_number: string; claimed_station_id: string }>(
      `SELECT serial_key, status, batch_number, claimed_station_id FROM hardware_devices WHERE UPPER(serial_key) = ? LIMIT 1`,
      [verifyKey]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { valid: false, error: 'Invalid Hardware Serial Number. Only official PrintKurox hardware units can be activated.' },
        { status: 404 }
      );
    }

    const device = rows[0];
    if (device.status === 'claimed') {
      return NextResponse.json(
        { valid: false, error: `This hardware unit has already been activated for station "${device.claimed_station_id}".` },
        { status: 409 }
      );
    }

    if (device.status === 'revoked') {
      return NextResponse.json(
        { valid: false, error: 'This hardware device serial has been revoked or deactivated.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      valid: true,
      serialKey: device.serial_key,
      batch: device.batch_number,
      status: 'unclaimed',
    });
  } catch (err: unknown) {
    console.error('Verify key error:', err);
    return NextResponse.json({ error: 'Failed to verify hardware key' }, { status: 500 });
  }
}

// POST /api/setup-station
export async function POST(req: NextRequest) {
  try {
    await ensureHardwareTable();
    const body = await req.json();
    const {
      serialKey,
      name,
      shortName,
      operatorName,
      whatsappNumber,
      adminPin,
      address,
      paymentMode = 'direct_upi',
      upiId,
      razorpayKeyId,
      allowCounterCash = true,
      pricing = {
        bwSingle: 3.0,
        bwDuplex: 5.0,
        colorSingle: 5.0,
        colorDuplex: 8.0,
        bwBulk: 2.5,
        colorBulk: 4.0,
      },
      printerName = 'EPSON L3210 Series',
      autoDuplex = false,
    } = body;

    // 1. Mandatory Hardware Serial Key Verification Gate
    const cleanKey = (serialKey || '').trim().toUpperCase();
    if (!cleanKey) {
      return NextResponse.json(
        { error: 'Hardware Serial Number is required. Look at the sticker on the bottom of your PrintKurox Controller Box.' },
        { status: 401 }
      );
    }

    const isMasterOverride = cleanKey === MASTER_ADMIN_SECRET.toUpperCase() || cleanKey === 'MASTER';

    if (!isMasterOverride) {
      const rows = await queryD1<{ serial_key: string; status: string; claimed_station_id: string }>(
        `SELECT serial_key, status, claimed_station_id FROM hardware_devices WHERE UPPER(serial_key) = ? LIMIT 1`,
        [cleanKey]
      );

      if (!rows || rows.length === 0) {
        return NextResponse.json(
          { error: 'Invalid Hardware Serial Number. Only official PrintKurox hardware units can be activated.' },
          { status: 403 }
        );
      }

      if (rows[0].status === 'claimed') {
        return NextResponse.json(
          { error: `This hardware unit has already been activated for station "${rows[0].claimed_station_id}".` },
          { status: 409 }
        );
      }
    }

    // 2. Validate form inputs
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Station or Shop Name is required (minimum 2 characters).' }, { status: 400 });
    }

    if (!adminPin || typeof adminPin !== 'string' || adminPin.trim().length < 4) {
      return NextResponse.json({ error: 'Admin PIN must be at least 4 characters long.' }, { status: 400 });
    }

    // Generate unique slugified station ID
    const rawSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const stationId = rawSlug.slice(0, 32) || `station_${Date.now()}`;

    // Generate secure station token
    const tokenHash = crypto.randomBytes(16).toString('hex');
    const stationToken = `kurox_st_${stationId}_${tokenHash}`;

    // Ensure stations table exists
    await executeD1(`
      CREATE TABLE IF NOT EXISTS stations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short_name TEXT,
        station_type TEXT NOT NULL,
        is_public INTEGER NOT NULL DEFAULT 1,
        whatsapp_number TEXT,
        admin_pin TEXT NOT NULL,
        station_token TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'offline',
        last_heartbeat DATETIME,
        duplex_enabled INTEGER NOT NULL DEFAULT 1,
        razorpay_route_split TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure app_settings table exists
    await executeD1(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Insert or update station in D1
    const cleanWhatsapp = (whatsappNumber || '').replace(/[^0-9]/g, '');
    await executeD1(
      `INSERT INTO stations (
        id, name, short_name, station_type, is_public, whatsapp_number, admin_pin, station_token, status, duplex_enabled, last_heartbeat
      ) VALUES (?, ?, ?, 'shop', 1, ?, ?, ?, 'standby', 1, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        short_name = excluded.short_name,
        whatsapp_number = excluded.whatsapp_number,
        admin_pin = excluded.admin_pin,
        station_token = excluded.station_token,
        status = 'standby',
        last_heartbeat = datetime('now');`,
      [
        stationId,
        name.trim(),
        shortName?.trim() || name.trim().slice(0, 16),
        cleanWhatsapp ? `+91${cleanWhatsapp.slice(-10)}` : null,
        adminPin.trim(),
        stationToken,
      ]
    );

    // 4. Save custom pricing
    const pricingConfig = {
      stationId,
      bwSingle: Number(pricing.bwSingle) || 3.0,
      colorSingle: Number(pricing.colorSingle) || 5.0,
      bwBulk: Number(pricing.bwBulk) || 2.5,
      colorBulk: Number(pricing.colorBulk) || 4.0,
      bwDuplex: Number(pricing.bwDuplex) || 5.0,
      colorDuplex: Number(pricing.colorDuplex) || 8.0,
      commissionPercent: 0,
    };
    await saveStationPricing(stationId, pricingConfig);

    // 5. Save payment settings
    const paymentConfig = {
      paymentMode,
      upiId: upiId ? String(upiId).trim() : '',
      qrName: name.trim(),
      razorpayKeyId: razorpayKeyId ? String(razorpayKeyId).trim() : '',
      allowCounterCash: Boolean(allowCounterCash),
      operatorName: operatorName ? String(operatorName).trim() : 'Operator',
      address: address ? String(address).trim() : '',
      hardwareSerial: cleanKey,
      updatedAt: new Date().toISOString(),
    };
    await executeD1(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now');`,
      [`station_payment_${stationId}`, JSON.stringify(paymentConfig)]
    );

    // 6. Mark hardware device as CLAIMED in inventory
    if (!isMasterOverride) {
      await executeD1(
        `UPDATE hardware_devices SET status = 'claimed', claimed_station_id = ?, claimed_at = datetime('now') WHERE UPPER(serial_key) = ?`,
        [stationId, cleanKey]
      );
    }

    // 7. Generate station_config.json object for the hardware daemon
    const stationConfigJson = {
      station_id: stationId,
      station_name: name.trim(),
      station_token: stationToken,
      server_url: process.env.NEXT_PUBLIC_APP_URL || 'https://printkurox.vercel.app',
      room_info: address?.trim() || 'PrintKurox Kiosk Station',
      contact: cleanWhatsapp.slice(-10) || '9362980761',
      whatsapp_bot_number: cleanWhatsapp ? `+91${cleanWhatsapp.slice(-10)}` : '+919362980761',
      printer_name: printerName || 'EPSON L3210 Series',
      auto_duplex: Boolean(autoDuplex),
      poll_interval_seconds: 12,
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://printkurox.vercel.app';
    const customerUrl = `${baseUrl}?station=${encodeURIComponent(stationId)}`;
    const adminUrl = `${baseUrl}/admin/${encodeURIComponent(stationId)}`;

    return NextResponse.json({
      success: true,
      stationId,
      stationToken,
      customerUrl,
      adminUrl,
      stationConfig: stationConfigJson,
      message: `Station "${name}" successfully bound to Hardware Key ${cleanKey}!`,
    });
  } catch (err: unknown) {
    console.error('Setup station error:', err);
    const message = err instanceof Error ? err.message : 'Failed to configure station';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
