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

    const { jobId, status, pagesPrinted, sheetsUsed } = await req.json();
    if (!jobId || !status) {
      return NextResponse.json({ error: 'jobId and status are required' }, { status: 400 });
    }

    const validStatuses = ['PAID', 'PRINTING', 'PRINTING_ODD', 'AWAITING_FLIP', 'PRINTING_EVEN', 'COMPLETED', 'FAILED'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    // D1 schema status check constraint does not contain 'PRINTING', only 'PRINTING_ODD'
    const safeStatus = status === 'PRINTING' ? 'PRINTING_ODD' : status;

    const station = auth.station;
    const isMain = station.id === 'block_b' || station.id === 'main';

    // Verify job belongs to this station
    const checkSql = isMain
      ? `SELECT id, status, total_pages, copies, is_duplex, color_mode FROM print_jobs WHERE id = ? AND (station_id = 'main' OR station_id = 'block_b' OR station_id IS NULL) LIMIT 1`
      : `SELECT id, status, total_pages, copies, is_duplex, color_mode FROM print_jobs WHERE id = ? AND station_id = ? LIMIT 1`;
    const checkParams = isMain ? [jobId] : [jobId, station.id];

    const rows = await queryD1<PrintJobRecord>(checkSql, checkParams);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Job not found for this station' }, { status: 404 });
    }

    const job = rows[0];

    // Update job status in D1
    await executeD1(`UPDATE print_jobs SET status = ? WHERE id = ?`, [safeStatus, jobId]);

    // If completed and this is primary station, deplete supplies
    if (status === 'COMPLETED' && isMain) {
      try {
        const pages = pagesPrinted || (job.total_pages * (job.copies || 1));
        const totalSheets = sheetsUsed || (job.is_duplex ? Math.ceil(pages / 2) : pages);
        const colorMode = (job.color_mode || 'bw').toLowerCase();

        if (colorMode === 'color') {
          await executeD1(
            `UPDATE printer_supplies 
             SET color_pages_remaining = MAX(0, color_pages_remaining - ?),
                 c_pages_remaining = MAX(0, COALESCE(c_pages_remaining, color_pages_remaining) - ?),
                 m_pages_remaining = MAX(0, COALESCE(m_pages_remaining, color_pages_remaining) - ?),
                 y_pages_remaining = MAX(0, COALESCE(y_pages_remaining, color_pages_remaining) - ?),
                 c_pct = ROUND(MAX(0.0, (COALESCE(c_pages_remaining, color_pages_remaining) - ?) * 100.0 / 7500.0), 1),
                 m_pct = ROUND(MAX(0.0, (COALESCE(m_pages_remaining, color_pages_remaining) - ?) * 100.0 / 7500.0), 1),
                 y_pct = ROUND(MAX(0.0, (COALESCE(y_pages_remaining, color_pages_remaining) - ?) * 100.0 / 7500.0), 1),
                 paper_sheets_remaining = MAX(0, paper_sheets_remaining - ?),
                 updated_at = datetime('now')
             WHERE id = 1`,
            [pages, pages, pages, pages, pages, pages, pages, totalSheets]
          );
        } else {
          await executeD1(
            `UPDATE printer_supplies 
             SET black_pages_remaining = MAX(0, black_pages_remaining - ?),
                 bk_pages_remaining = MAX(0, COALESCE(bk_pages_remaining, black_pages_remaining) - ?),
                 bk_pct = ROUND(MAX(0.0, (COALESCE(bk_pages_remaining, black_pages_remaining) - ?) * 100.0 / 4500.0), 1),
                 paper_sheets_remaining = MAX(0, paper_sheets_remaining - ?),
                 updated_at = datetime('now')
             WHERE id = 1`,
            [pages, pages, pages, totalSheets]
          );
        }
      } catch (suppliesErr) {
        console.warn('Supplies depletion warning:', suppliesErr);
      }
    }

    return NextResponse.json({
      success: true,
      jobId,
      status,
    });
  } catch (err: unknown) {
    console.error('Daemon status update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
