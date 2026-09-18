import { NextResponse } from 'next/server';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import { getStationConfig, getCampusStations } from '@/lib/stations';

interface HeartbeatRow {
  id?: number;
  updated_at: string;
  station_id?: string | null;
}

// Ensure the heartbeat table exists (runs on first call)
async function ensureTable() {
  await executeD1(`
    CREATE TABLE IF NOT EXISTS daemon_heartbeat (
      id INTEGER PRIMARY KEY DEFAULT 1,
      updated_at TEXT NOT NULL,
      station_id TEXT
    )
  `);
  await executeD1(`
    INSERT OR IGNORE INTO daemon_heartbeat (id, updated_at, station_id) VALUES (1, datetime('now'), 'block_b')
  `);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wantAll = searchParams.get('all') === 'true';

    // 1. If requester wants status for all campus stations
    if (wantAll) {
      let rows: HeartbeatRow[] = [];
      try {
        rows = await queryD1<HeartbeatRow>(
          `SELECT id, updated_at, station_id FROM daemon_heartbeat`
        );
      } catch {
        await ensureTable();
        rows = await queryD1<HeartbeatRow>(
          `SELECT id, updated_at, station_id FROM daemon_heartbeat`
        );
      }

      const campusStations = getCampusStations();
      const now = Date.now();

      const statuses = campusStations.map((station) => {
        // Find matching heartbeat row by slot or station_id
        const row = rows.find(
          (r) =>
            r.station_id === station.id ||
            r.id === station.slot ||
            (station.id === 'block_b' && (r.id === 1 || r.station_id === 'main'))
        );

        if (!row || !row.updated_at) {
          return {
            stationId: station.id,
            name: station.name,
            shortName: station.shortName,
            blockCode: station.blockCode,
            riverName: station.riverName,
            online: false,
            status: station.status,
            lastSeen: null,
            ageSeconds: null,
          };
        }

        const lastSeenDate = new Date(row.updated_at.replace(' ', 'T') + 'Z');
        const ageSeconds = Math.max(0, (now - lastSeenDate.getTime()) / 1000);
        const online = ageSeconds <= 90;

        return {
          stationId: station.id,
          name: station.name,
          shortName: station.shortName,
          blockCode: station.blockCode,
          riverName: station.riverName,
          online,
          status: station.status,
          lastSeen: row.updated_at,
          ageSeconds: Math.round(ageSeconds),
        };
      });

      return NextResponse.json(
        { stations: statuses },
        {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=10, stale-while-revalidate=20',
          },
        }
      );
    }

    // 2. Single station lookup
    const stationParam = searchParams.get('station_id') || searchParams.get('station');
    const station = getStationConfig(stationParam);
    const stationSlot = station.slot;
    const stationId = station.id;

    let rows = await queryD1<HeartbeatRow>(
      `SELECT updated_at FROM daemon_heartbeat WHERE id = ? OR station_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [stationSlot, stationId]
    );

    if (!rows || rows.length === 0) {
      if (station.id === 'block_b' || station.id === 'main') {
        await ensureTable();
        rows = await queryD1<HeartbeatRow>('SELECT updated_at FROM daemon_heartbeat WHERE id = 1 OR id = ?', [stationSlot]);
      }
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ online: false, stationId: station.id, lastSeen: null }, { status: 200 });
    }

    const lastSeen: string = rows[0].updated_at;
    const lastSeenDate = new Date(lastSeen.replace(' ', 'T') + 'Z');
    const ageSeconds = (Date.now() - lastSeenDate.getTime()) / 1000;
    const online = ageSeconds <= 90;

    return NextResponse.json(
      {
        online,
        stationId: station.id,
        stationName: station.name,
        lastSeen,
        ageSeconds: Math.round(ageSeconds),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
        },
      }
    );
  } catch (err) {
    console.error('[printer-status]', err);
    return NextResponse.json({ online: false, lastSeen: null }, { status: 200 });
  }
}
