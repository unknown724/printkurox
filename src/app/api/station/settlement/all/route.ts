import { NextRequest, NextResponse } from 'next/server';
import { getStationSettlementSummary } from '@/lib/settlement-service';
import { queryD1 } from '@/lib/cloudflare-d1';
import { verifyAdminDevice, validateAdminPin, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const deviceId = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    let isAuthorized = false;

    if (deviceId) {
      const { isValid } = await verifyAdminDevice(deviceId);
      if (isValid) isAuthorized = true;
    }

    if (!isAuthorized) {
      const authHeader = req.headers.get('authorization')?.replace('Bearer ', '');
      if (authHeader && validateAdminPin(authHeader)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get all stations from D1
    const stations = await queryD1<{ id: string; name: string }>(
      `SELECT id, name FROM stations ORDER BY created_at ASC`
    );

    const summaries: Record<string, any> = {};
    for (const st of stations) {
      try {
        summaries[st.id] = await getStationSettlementSummary(st.id);
      } catch (err) {
        console.warn(`Could not get settlement summary for ${st.id}:`, err);
      }
    }

    // Also include 'block_b' default if not in stations table
    if (!summaries['block_b']) {
      try {
        summaries['block_b'] = await getStationSettlementSummary('block_b');
      } catch {}
    }

    return NextResponse.json({ success: true, summaries });
  } catch (err: any) {
    console.error('All settlements summary error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
