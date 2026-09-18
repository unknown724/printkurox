import { NextRequest, NextResponse } from 'next/server';
import { validateStationToken } from '@/lib/stations';
import { queryD1, PrintJobRecord } from '@/lib/cloudflare-d1';

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
    const isMain = station.id === 'block_b' || station.id === 'main';

    let sql: string;
    let params: (string | number)[];

    if (isMain) {
      sql = `SELECT id, pickup_code, file_name, file_key, total_pages, page_range, color_mode, is_duplex, copies, status, station_id, created_at, orientation, page_configs
             FROM print_jobs
             WHERE status = 'PAID' AND (station_id = 'main' OR station_id = 'block_b' OR station_id IS NULL)
             ORDER BY created_at ASC
             LIMIT 5`;
      params = [];
    } else {
      sql = `SELECT id, pickup_code, file_name, file_key, total_pages, page_range, color_mode, is_duplex, copies, status, station_id, created_at, orientation, page_configs
             FROM print_jobs
             WHERE status = 'PAID' AND station_id = ?
             ORDER BY created_at ASC
             LIMIT 5`;
      params = [station.id];
    }

    const jobs = await queryD1<PrintJobRecord>(sql, params);

    return NextResponse.json({
      success: true,
      stationId: station.id,
      stationName: station.name,
      count: jobs.length,
      jobs,
    });
  } catch (err: unknown) {
    console.error('Daemon poll error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
