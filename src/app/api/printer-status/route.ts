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
        const online = ageSeconds <= 20;

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
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
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
      return NextResponse.json(
        { online: false, stationId: station.id, lastSeen: null },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    // Check physical hardware telemetry for primary station
    let hardwareOnline = true;
    let hardwareStatusText = 'Ready';
    if (station.id === 'block_b' || station.id === 'main') {
      try {
        const telemRows = await queryD1<{ is_online?: number; status_text?: string }>(
          `SELECT is_online, status_text FROM printer_telemetry WHERE id = 1 LIMIT 1`
        );
        if (telemRows && telemRows.length > 0) {
          if (telemRows[0].is_online === 0) {
            hardwareOnline = false;
            hardwareStatusText = telemRows[0].status_text || 'Offline';
          }
        }
      } catch {}
    }

    const lastSeen: string = rows[0].updated_at;
    const lastSeenDate = new Date(lastSeen.replace(' ', 'T') + 'Z');
    const ageSeconds = (Date.now() - lastSeenDate.getTime()) / 1000;
    const daemonAlive = ageSeconds <= 20;
    const online = daemonAlive && hardwareOnline;

    return NextResponse.json(
      {
        online,
        stationId: station.id,
        stationName: station.name,
        lastSeen,
        ageSeconds: Math.round(ageSeconds),
        hardwareStatus: hardwareStatusText,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (err) {
    console.error('[printer-status]', err);
    return NextResponse.json(
      { online: false, lastSeen: null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  }
}
