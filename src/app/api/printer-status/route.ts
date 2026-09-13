import { NextResponse } from 'next/server';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';

interface HeartbeatRow {
  updated_at: string;
}

// Ensure the heartbeat table exists (runs on first call)
async function ensureTable() {
  await executeD1(`
    CREATE TABLE IF NOT EXISTS daemon_heartbeat (
      id INTEGER PRIMARY KEY DEFAULT 1,
      updated_at TEXT NOT NULL
    )
  `);
  await executeD1(`
    INSERT OR IGNORE INTO daemon_heartbeat (id, updated_at) VALUES (1, datetime('now'))
  `);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const stationParam = searchParams.get('station_id') || searchParams.get('station');
    const isRomen = stationParam === 'romen' || stationParam === 'romen_xerox';
    const stationSlot = isRomen ? 154 : 1;
    const stationId = isRomen ? 'romen_xerox' : 'main';

    let rows = await queryD1<HeartbeatRow>(
      `SELECT updated_at FROM daemon_heartbeat WHERE id = ? OR station_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [stationSlot, stationId]
    );

    if (!rows || rows.length === 0) {
      if (!isRomen) {
        await ensureTable();
        rows = await queryD1<HeartbeatRow>('SELECT updated_at FROM daemon_heartbeat WHERE id = ?', [1]);
      }
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ online: false, lastSeen: null }, { status: 200 });
    }

    const lastSeen: string = rows[0].updated_at;
    // Parse UTC datetime from SQLite (format: "2024-01-01 12:00:00")
    const lastSeenDate = new Date(lastSeen.replace(' ', 'T') + 'Z');
    const ageSeconds = (Date.now() - lastSeenDate.getTime()) / 1000;

    // Printer considered online if heartbeat is within 90 seconds
    const online = ageSeconds <= 90;

    return NextResponse.json(
      { online, lastSeen, ageSeconds: Math.round(ageSeconds) },
      {
        status: 200,
        headers: {
          // Cache for 20 seconds max on CDN
          'Cache-Control': 'public, max-age=20, stale-while-revalidate=30',
        },
      }
    );
  } catch (err) {
    console.error('[printer-status]', err);
    // If we can't reach D1, report offline
    return NextResponse.json({ online: false, lastSeen: null }, { status: 200 });
  }
}
