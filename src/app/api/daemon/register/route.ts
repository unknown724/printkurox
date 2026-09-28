import { NextRequest, NextResponse } from 'next/server';
import { executeD1, queryD1 } from '@/lib/cloudflare-d1';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      name, 
      shortName, 
      stationType, 
      whatsappNumber, 
      adminPin,
      duplexEnabled = 1
    } = body;

    if (!name || !stationType || !adminPin) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const stationId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const stationToken = crypto.randomBytes(32).toString('hex');
    const isPublic = (stationType === 'hostel' || stationType === 'shop') ? 1 : 0;

    const createTableSql = `
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
    `;
    await executeD1(createTableSql);

    const insertSql = `
      INSERT INTO stations 
        (id, name, short_name, station_type, is_public, whatsapp_number, admin_pin, station_token, status, duplex_enabled, last_heartbeat)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        short_name = excluded.short_name,
        station_type = excluded.station_type,
        is_public = excluded.is_public,
        whatsapp_number = excluded.whatsapp_number,
        admin_pin = excluded.admin_pin,
        station_token = excluded.station_token,
        status = 'online',
        duplex_enabled = excluded.duplex_enabled,
        last_heartbeat = datetime('now')
    `;

    const success = await executeD1(insertSql, [
      stationId, 
      name, 
      shortName || null, 
      stationType, 
      isPublic, 
      whatsappNumber || null, 
      adminPin, 
      stationToken,
      duplexEnabled ? 1 : 0
    ]);

    if (!success) {
      return NextResponse.json({ error: 'Failed to insert station into database' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      station_id: stationId,
      station_token: stationToken,
      message: 'Station registered successfully'
    });

  } catch (err: any) {
    console.error('Station registration error:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
