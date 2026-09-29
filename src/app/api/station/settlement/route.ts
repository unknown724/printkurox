import { NextRequest, NextResponse } from 'next/server';
import {
  getStationSettlementSummary,
  settleStationBalance,
  updateStationUpi,
} from '@/lib/settlement-service';
import { verifyAdminDevice, validateAdminPin, ADMIN_COOKIE_NAME, verifyStationSession } from '@/lib/admin-auth';
import { validateStationPin, normalizeStationId } from '@/lib/stations';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function checkAdminAuth(req: NextRequest, bodyPin?: string): Promise<boolean> {
  const deviceId = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (deviceId) {
    const { isValid } = await verifyAdminDevice(deviceId);
    if (isValid) return true;
  }
  if (bodyPin && validateAdminPin(bodyPin)) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stationId = searchParams.get('stationId');

    if (!stationId) {
      return NextResponse.json({ success: false, error: 'stationId is required' }, { status: 400 });
    }

    const summary = await getStationSettlementSummary(stationId);
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error('Error fetching settlement summary:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, stationId, paymentRef, notes, upiId, quota, pin, token } = body;

    if (!stationId) {
      return NextResponse.json({ success: false, error: 'stationId is required' }, { status: 400 });
    }

    const isGlobalAdmin = await checkAdminAuth(req, pin);

    // 1. Mark Settlement as Paid (Global Admin Only)
    if (action === 'SETTLE') {
      if (!isGlobalAdmin) {
        return NextResponse.json({ success: false, error: 'Unauthorized: Master Admin privileges required to settle payouts.' }, { status: 403 });
      }

      const res = await settleStationBalance({
        stationId,
        paymentRef,
        notes,
        createdBy: 'ADMIN',
      });

      if (!res.success) {
        return NextResponse.json({ success: false, error: res.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: `Settlement completed! ₹${res.settlement?.payout_amount} settled. Pending balance is now ₹0.`,
        settlement: res.settlement,
      });
    }

    // 2. Update UPI ID (Station Owner or Global Admin)
    if (action === 'UPDATE_UPI') {
      let isAuthorized = isGlobalAdmin;
      if (!isAuthorized) {
        // Check station pin / session
        const stationPinCookie = req.cookies.get('station_admin_pin')?.value;
        const stationSessionCookie = req.cookies.get('printkurox_station_session')?.value;
        const session = verifyStationSession(stationSessionCookie);
        
        if (session && session.stationId === normalizeStationId(stationId)) {
          isAuthorized = true;
        } else if (pin && validateStationPin(stationId, pin)) {
          isAuthorized = true;
        } else if (stationPinCookie && validateStationPin(stationId, stationPinCookie)) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return NextResponse.json({ success: false, error: 'Unauthorized to update station UPI' }, { status: 403 });
      }

      if (!upiId || typeof upiId !== 'string' || !upiId.includes('@')) {
        return NextResponse.json({ success: false, error: 'Invalid UPI ID format (e.g. name@okaxis)' }, { status: 400 });
      }

      await updateStationUpi(stationId, upiId);
      return NextResponse.json({ success: true, message: 'UPI ID updated successfully', upiId });
    }

    // 3. Update Free Monthly Quota (Global Admin Only)
    if (action === 'UPDATE_QUOTA') {
      if (!isGlobalAdmin) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
      }
      const newQuota = parseInt(quota, 10);
      if (isNaN(newQuota) || newQuota < 0 || newQuota > 500) {
        return NextResponse.json({ success: false, error: 'Quota must be between 0 and 500' }, { status: 400 });
      }

      const normId = normalizeStationId(stationId);
      await executeD1(
        `UPDATE stations SET monthly_free_quota = ? WHERE id = ? OR id = ?`,
        [newQuota, stationId, normId]
      );

      return NextResponse.json({ success: true, message: `Monthly free quota updated to ${newQuota} pages`, quota: newQuota });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('Settlement API error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
