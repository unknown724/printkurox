import { NextRequest, NextResponse } from 'next/server';
import { executeD1, queryD1 } from '@/lib/cloudflare-d1';
import { saveStationPricing } from '@/lib/station-pricing';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
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

    // 1. Insert or update station in D1
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

    // 2. Save station custom pricing in D1
    const pricingConfig = {
      stationId,
      bwSingle: Number(pricing.bwSingle) || 3.0,
      colorSingle: Number(pricing.colorSingle) || 5.0,
      bwBulk: Number(pricing.bwBulk) || 2.5,
      colorBulk: Number(pricing.colorBulk) || 4.0,
      bwDuplex: Number(pricing.bwDuplex) || 5.0,
      colorDuplex: Number(pricing.colorDuplex) || 8.0,
      commissionPercent: 0, // Zero commission requested
    };
    await saveStationPricing(stationId, pricingConfig);

    // 3. Save payment configuration in D1 app_settings
    const paymentConfig = {
      paymentMode,
      upiId: upiId ? String(upiId).trim() : '',
      qrName: name.trim(),
      razorpayKeyId: razorpayKeyId ? String(razorpayKeyId).trim() : '',
      allowCounterCash: Boolean(allowCounterCash),
      operatorName: operatorName ? String(operatorName).trim() : 'Operator',
      address: address ? String(address).trim() : '',
      updatedAt: new Date().toISOString(),
    };
    await executeD1(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now');`,
      [`station_payment_${stationId}`, JSON.stringify(paymentConfig)]
    );

    // 4. Generate the station_config.json object for the hardware daemon
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
      message: `Station "${name}" successfully registered and configured!`,
    });
  } catch (err: unknown) {
    console.error('Setup station error:', err);
    const message = err instanceof Error ? err.message : 'Failed to configure station';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
