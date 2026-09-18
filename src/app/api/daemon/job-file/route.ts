import { NextRequest, NextResponse } from 'next/server';
import { validateStationToken } from '@/lib/stations';
import { queryD1, PrintJobRecord } from '@/lib/cloudflare-d1';
import { getFileBufferFromR2 } from '@/lib/cloudflare-r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId') || searchParams.get('job_id');
    const tokenParam = searchParams.get('token');
    const stationToken = req.headers.get('x-station-token') || tokenParam;

    const auth = validateStationToken(stationToken);
    if (!auth.isValid || !auth.station) {
      return NextResponse.json({ error: 'Unauthorized: Invalid station token' }, { status: 401 });
    }

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const station = auth.station;
    const isMain = station.id === 'block_b' || station.id === 'main';

    const checkSql = isMain
      ? `SELECT id, file_key, file_name, status, pickup_code, station_id FROM print_jobs WHERE id = ? AND (station_id = 'main' OR station_id = 'block_b' OR station_id IS NULL) LIMIT 1`
      : `SELECT id, file_key, file_name, status, pickup_code, station_id FROM print_jobs WHERE id = ? AND station_id = ? LIMIT 1`;
    const checkParams = isMain ? [jobId] : [jobId, station.id];

    const rows = await queryD1<PrintJobRecord>(checkSql, checkParams);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Job not found for this station' }, { status: 404 });
    }

    const job = rows[0];
    if (!job.file_key || job.file_key === 'ARCHIVED_LOCALLY' || job.file_key === '') {
      return NextResponse.json({ error: 'FILE_PURGED', message: 'Cloud document was purged or archived locally' }, { status: 410 });
    }

    // Fetch binary from private R2 bucket using server-side master credentials
    const fileBuffer = await getFileBufferFromR2(job.file_key);

    const safeName = (job.file_name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: unknown) {
    console.error('Daemon job-file error:', err);
    return NextResponse.json({ error: 'Failed to retrieve file from cloud storage' }, { status: 500 });
  }
}
