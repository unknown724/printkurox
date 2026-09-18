import { NextRequest, NextResponse } from 'next/server';
import { validateStationToken } from '@/lib/stations';
import { executeD1 } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const stationToken = req.headers.get('x-station-token') || req.headers.get('authorization')?.replace('Bearer ', '');
    const auth = validateStationToken(stationToken);

    if (!auth.isValid || !auth.station) {
      return NextResponse.json({ error: 'Unauthorized: Invalid station token' }, { status: 401 });
    }

    const station = auth.station;
    const body = await req.json().catch(() => ({}));
    const telemetry = body.telemetry;

    // Record station heartbeat in D1
    await executeD1(
      `INSERT INTO daemon_heartbeat (id, updated_at, station_id)
       VALUES (?, datetime('now'), ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = datetime('now'), station_id = excluded.station_id`,
      [station.slot, station.id]
    );

    // If hardware telemetry was sent from primary station, update printer_telemetry in D1
    if (telemetry && (station.id === 'block_b' || station.id === 'main')) {
      await executeD1(
        `UPDATE printer_telemetry
         SET printer_name = ?, is_online = ?, status_text = ?, spooler_jobs = ?, updated_at = datetime('now')
         WHERE id = 1`,
        [telemetry.name || 'Printer', telemetry.is_online ?? 1, telemetry.status_text || 'Ready', telemetry.spooler_jobs ?? 0]
      );
    }

    return NextResponse.json({
      success: true,
      stationId: station.id,
      slot: station.slot,
      syncedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Daemon heartbeat error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
