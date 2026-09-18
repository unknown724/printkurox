import { NextRequest, NextResponse } from 'next/server';
import { validateStationToken } from '@/lib/stations';
import { executeD1, queryD1, PrintJobRecord } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const stationToken = req.headers.get('x-station-token') || req.headers.get('authorization')?.replace('Bearer ', '');
    const auth = validateStationToken(stationToken);

    if (!auth.isValid || !auth.station) {
      return NextResponse.json({ error: 'Unauthorized: Invalid station token' }, { status: 401 });
    }

    const { jobId } = await req.json();
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const station = auth.station;
    const isMain = station.id === 'block_b' || station.id === 'main';

    // Verify job belongs to this station and is PAID
    const checkSql = isMain
      ? `SELECT id, status, pickup_code FROM print_jobs WHERE id = ? AND (station_id = 'main' OR station_id = 'block_b' OR station_id IS NULL) LIMIT 1`
      : `SELECT id, status, pickup_code FROM print_jobs WHERE id = ? AND station_id = ? LIMIT 1`;
    const checkParams = isMain ? [jobId] : [jobId, station.id];

    const rows = await queryD1<PrintJobRecord>(checkSql, checkParams);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Job not found for this station', claimed: false }, { status: 404 });
    }

    const job = rows[0];
    if (job.status !== 'PAID') {
      return NextResponse.json({
        claimed: false,
        status: job.status,
        message: `Job already claimed or not in PAID state (${job.status})`,
      });
    }

    // Atomic CAS update
    const updateSuccess = await executeD1(
      `UPDATE print_jobs SET status = 'PRINTING_ODD' WHERE id = ? AND status = 'PAID'`,
      [jobId]
    );

    return NextResponse.json({
      claimed: updateSuccess,
      jobId,
      pickup_code: job.pickup_code,
      status: 'PRINTING_ODD',
    });
  } catch (err: unknown) {
    console.error('Daemon claim error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
