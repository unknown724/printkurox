import { NextRequest, NextResponse } from 'next/server';
import { executeD1, queryD1 } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stationId, stationToken } = body;

    if (!stationId) {
      return NextResponse.json({ error: 'Missing stationId' }, { status: 400 });
    }

    // Verify station token if provided (extra safety)
    if (stationToken) {
      const rows = await queryD1(
        'SELECT id, station_token FROM stations WHERE id = ?',
        [stationId]
      );
      if (rows && rows.length > 0 && rows[0].station_token !== stationToken) {
        return NextResponse.json({ error: 'Invalid station token' }, { status: 403 });
      }
    }

    // Delete the station
    const deleted = await executeD1('DELETE FROM stations WHERE id = ?', [stationId]);

    // Also clean up any print jobs for this station
    try {
      await executeD1('DELETE FROM print_jobs WHERE station_id = ?', [stationId]);
    } catch {
      // Table might not exist, ignore
    }

    return NextResponse.json({
      success: true,
      message: `Station '${stationId}' deleted successfully`,
    });

  } catch (err: any) {
    console.error('Station delete error:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
