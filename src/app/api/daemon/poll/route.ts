import { NextRequest, NextResponse } from 'next/server';
import { validateStationTokenAsync, normalizeStationId } from '@/lib/stations';
import { queryD1, PrintJobRecord } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePoll(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stationToken =
      req.headers.get('x-station-token') ||
      req.headers.get('authorization')?.replace('Bearer ', '') ||
      searchParams.get('token');

    const auth = await validateStationTokenAsync(stationToken);

    if (!auth.isValid || !auth.station) {
      return NextResponse.json({ error: 'Unauthorized: Invalid station token' }, { status: 401 });
    }

    const station = auth.station;
    const normId = normalizeStationId(station.id);
    const isMain = normId === 'block_b' || normId === 'main';

    let sql: string;
    let params: (string | number)[];

    if (isMain) {
      sql = `SELECT id, pickup_code, file_name, file_key, total_pages, page_range, color_mode, is_duplex, copies, status, station_id, created_at, orientation, page_configs
             FROM print_jobs
             WHERE status = 'PAID' AND (
               station_id = 'main' OR 
               station_id = 'block_b' OR 
               station_id = 'hostel_block_b_pare' OR 
               station_id = 'pare' OR 
               station_id IS NULL
             )
             ORDER BY created_at ASC
             LIMIT 5`;
      params = [];
    } else {
      sql = `SELECT id, pickup_code, file_name, file_key, total_pages, page_range, color_mode, is_duplex, copies, status, station_id, created_at, orientation, page_configs
             FROM print_jobs
             WHERE status = 'PAID' AND (
               station_id = ? OR 
               station_id = ? OR 
               station_id = ?
             )
             ORDER BY created_at ASC
             LIMIT 5`;
      params = [station.id, normId, `hostel_${station.id}`];
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

export async function POST(req: NextRequest) {
  return handlePoll(req);
}

export async function GET(req: NextRequest) {
  return handlePoll(req);
}

