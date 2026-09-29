import { NextRequest, NextResponse } from 'next/server';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeAll = searchParams.get('all') === 'true';

    // Ensure table exists
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

    // Fetch stations (public only for students, or all if requested by admin)
    const sql = includeAll
      ? `SELECT id, name, short_name as shortName, station_type as type, is_public as isPublic, whatsapp_number as whatsappNumber, admin_pin as adminPin, station_token as stationToken, status, last_heartbeat, duplex_enabled as duplexEnabled, upi_id as upiId, monthly_free_quota as monthlyFreeQuota, created_at as createdAt FROM stations ORDER BY created_at ASC`
      : `SELECT id, name, short_name as shortName, station_type as type, is_public as isPublic, whatsapp_number as whatsappNumber, status, last_heartbeat, duplex_enabled as duplexEnabled, upi_id as upiId, monthly_free_quota as monthlyFreeQuota FROM stations WHERE is_public = 1 ORDER BY created_at ASC`;

    const rows = await queryD1(sql);

    // Also get daemon_heartbeats to cross-reference active connectors
    let heartbeatRows: any[] = [];
    try {
      heartbeatRows = await queryD1(`SELECT id, updated_at, station_id FROM daemon_heartbeat`);
    } catch {}

    const now = Date.now();

    // Process rows to determine accurate online/offline status based on last_heartbeat & daemon_heartbeat
    const stations = rows.map((row: any) => {
      let isOnline = false;
      let offlineMinutes = 0;
      let effectiveHeartbeat = row.last_heartbeat;

      // Check if daemon_heartbeat has a fresher ping
      const hb = heartbeatRows.find(
        (h: any) =>
          h.station_id === row.id ||
          (row.id === 'hostel_block_b_pare' && (h.station_id === 'block_b' || h.station_id === 'main' || h.id === 1)) ||
          (row.shortName && h.station_id === row.shortName.toLowerCase())
      );

      if (hb && hb.updated_at) {
        const hbTime = new Date(hb.updated_at.replace(' ', 'T') + 'Z').getTime();
        const rowTime = row.last_heartbeat ? new Date(row.last_heartbeat.replace(' ', 'T') + 'Z').getTime() : 0;
        if (hbTime > rowTime) {
          effectiveHeartbeat = hb.updated_at;
        }
      }

      if (effectiveHeartbeat) {
        const heartbeatTime = new Date(effectiveHeartbeat.replace(' ', 'T') + 'Z').getTime();
        const diffSeconds = Math.floor((now - heartbeatTime) / 1000);

        if (diffSeconds < 60) {
          isOnline = true;
        } else {
          offlineMinutes = Math.floor(diffSeconds / 60);
        }
      }

      return {
        id: row.id,
        name: row.name,
        shortName: row.shortName,
        type: row.type || 'hostel',
        isPublic: row.isPublic === 1,
        whatsappNumber: row.whatsappNumber,
        stationToken: row.stationToken,
        status: isOnline ? 'online' : 'offline',
        offlineText: isOnline ? null : (offlineMinutes > 0 ? `Offline for ${offlineMinutes} min` : 'Offline'),
        duplexEnabled: row.duplexEnabled === 1,
        createdAt: row.createdAt,
      };
    });

    return NextResponse.json({ success: true, stations });
  } catch (err: any) {
    console.error('Failed to list stations:', err);
    return NextResponse.json({ error: 'Failed to fetch stations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      shortName,
      stationType = 'hostel',
      whatsappNumber = '+919863013886',
      adminPin = '1234',
      isPublic = 1,
      duplexEnabled = 1,
    } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Station name is required' }, { status: 400 });
    }

    const cleanName = name.trim();
    const stationId = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const stationToken = `kurox_st_${stationId}_${crypto.randomBytes(16).toString('hex')}`;

    const insertSql = `
      INSERT INTO stations 
        (id, name, short_name, station_type, is_public, whatsapp_number, admin_pin, station_token, status, duplex_enabled, created_at)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, 'offline', ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        short_name = excluded.short_name,
        station_type = excluded.station_type,
        is_public = excluded.is_public,
        whatsapp_number = excluded.whatsapp_number,
        admin_pin = excluded.admin_pin,
        duplex_enabled = excluded.duplex_enabled;
    `;

    const success = await executeD1(insertSql, [
      stationId,
      cleanName,
      shortName ? shortName.trim().toUpperCase() : null,
      stationType,
      isPublic ? 1 : 0,
      whatsappNumber,
      adminPin,
      stationToken,
      duplexEnabled ? 1 : 0,
    ]);

    if (!success) {
      return NextResponse.json({ error: 'Failed to create station in database' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      station_id: stationId,
      station_token: stationToken,
      message: `Station '${cleanName}' created successfully`,
    });
  } catch (err: any) {
    console.error('Create station error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create station' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const stationId = (body.stationId || searchParams.get('stationId') || '').toLowerCase().trim();

    if (!stationId) {
      return NextResponse.json({ error: 'Missing stationId to delete' }, { status: 400 });
    }

    const deleteSql = `DELETE FROM stations WHERE id = ?`;
    const success = await executeD1(deleteSql, [stationId]);

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete station from database' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      stationId,
      message: `Station '${stationId}' has been deleted successfully.`,
    });
  } catch (err: any) {
    console.error('Delete station error:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete station' }, { status: 500 });
  }
}
