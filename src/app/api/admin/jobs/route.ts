import { NextRequest, NextResponse } from 'next/server';
import { queryD1, executeD1, PrintJobRecord } from '@/lib/cloudflare-d1';
import { verifyAdminToken, ADMIN_COOKIE_NAME, validateAdminPin } from '@/lib/admin-auth';
import { validateStationPin, getStationConfig } from '@/lib/stations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAuthorized(req: NextRequest, stationId?: string | null): Promise<boolean> {
  // 1. Check master admin device cookie
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (token && (await verifyAdminToken(token))) {
    return true;
  }

  // 2. Check station-specific PIN or master PIN via header or cookie
  const pinHeader = req.headers.get('x-station-pin') || req.cookies.get('station_admin_pin')?.value;
  if (pinHeader) {
    if (validateAdminPin(pinHeader)) return true;
    if (stationId && validateStationPin(stationId, pinHeader)) return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stationParam = searchParams.get('station_id') || searchParams.get('station');
    const station = stationParam ? getStationConfig(stationParam) : null;
    const stationId = station ? station.id : null;

    if (!(await isAuthorized(req, stationId))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query = `SELECT id, pickup_code, file_name, file_key, total_pages, color_mode, is_duplex, copies, total_price, status, payment_id, created_at, station_id
                 FROM print_jobs`;
    const params: string[] = [];

    if (stationId) {
      query += ` WHERE station_id = ?`;
      params.push(stationId);
    }

    query += ` ORDER BY created_at DESC LIMIT 50`;

    const jobs = await queryD1(query, params);

    return NextResponse.json({ success: true, jobs });
  } catch (err: unknown) {
    console.error('Error fetching admin jobs:', err);
    return NextResponse.json({ error: 'Failed to query jobs' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, action, station_id: rawStationId } = body;

    const station = rawStationId ? getStationConfig(rawStationId) : null;
    const stationId = station ? station.id : null;

    if (!jobId || !action) {
      return NextResponse.json({ error: 'jobId and action are required' }, { status: 400 });
    }

    if (!(await isAuthorized(req, stationId))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify job exists
    const jobs = await queryD1<PrintJobRecord>(
      `SELECT id, status, pickup_code, station_id FROM print_jobs WHERE id = ? LIMIT 1`,
      [jobId]
    );
    if (jobs.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = jobs[0];

    let newStatus = job.status;
    let paymentIdUpdate: string | null = null;

    if (action === 'approve') {
      // Station operator approves counter payment -> queues for printing
      newStatus = 'PAID';
      paymentIdUpdate = `CASH_COUNTER_${Date.now()}`;
    } else if (action === 'reprint') {
      // Re-trigger printing
      newStatus = 'PAID';
    } else if (action === 'cancel') {
      newStatus = 'FAILED';
    } else if (action === 'complete') {
      newStatus = 'COMPLETED';
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (paymentIdUpdate) {
      await executeD1(
        `UPDATE print_jobs SET status = ?, payment_id = ? WHERE id = ?`,
        [newStatus, paymentIdUpdate, jobId]
      );
    } else {
      await executeD1(
        `UPDATE print_jobs SET status = ? WHERE id = ?`,
        [newStatus, jobId]
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: newStatus,
      message: `Job updated to ${newStatus}`,
    });
  } catch (err: unknown) {
    console.error('Error updating job status:', err);
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
  }
}

