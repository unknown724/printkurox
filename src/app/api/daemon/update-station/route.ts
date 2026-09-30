import { NextRequest, NextResponse } from 'next/server';
import { executeD1, queryD1 } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      stationId,
      stationToken,
      name,
      shortName,
      adminPin,
      deleteOldId,  // Optional: delete a different station ID (for room-change cleanup)
    } = body;

    if (!stationId || !stationToken) {
      return NextResponse.json({ error: 'Missing stationId or stationToken' }, { status: 400 });
    }

    // Verify station token matches
    const rows = await queryD1<{ id: string; station_token?: string }>(
      'SELECT id, station_token FROM stations WHERE id = ?',
      [stationId]
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }
    if (rows[0].station_token !== stationToken) {
      return NextResponse.json({ error: 'Invalid station token' }, { status: 403 });
    }

    // Update station fields in-place (station_id stays the same)
    const updateSql = `
      UPDATE stations 
      SET name = COALESCE(?, name),
          short_name = COALESCE(?, short_name),
          admin_pin = COALESCE(?, admin_pin),
          last_heartbeat = datetime('now')
      WHERE id = ?
    `;
    const updated = await executeD1(updateSql, [
      name || null,
      shortName || null,
      adminPin || null,
      stationId,
    ]);

    // If a different old station ID was provided, delete it (room-change cleanup)
    if (deleteOldId && deleteOldId !== stationId) {
      await executeD1('DELETE FROM stations WHERE id = ?', [deleteOldId]);
    }

    return NextResponse.json({
      success: true,
      station_id: stationId,
      message: 'Station updated successfully',
    });

  } catch (err: any) {
    console.error('Station update error:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
