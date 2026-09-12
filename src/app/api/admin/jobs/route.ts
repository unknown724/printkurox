import { NextRequest, NextResponse } from 'next/server';
import { queryD1, executeD1, PrintJobRecord } from '@/lib/cloudflare-d1';
import { verifyAdminToken, ADMIN_COOKIE_NAME, validateAdminPin } from '@/lib/admin-auth';
import { validateStationPin, getStationConfig } from '@/lib/stations';
import { deleteFromR2 } from '@/lib/cloudflare-r2';

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

    let query = `SELECT id, pickup_code, file_name, file_key, total_pages, color_mode, is_duplex, copies, total_price, status, payment_id, created_at, expires_at, station_id
                 FROM print_jobs`;
    const params: string[] = [];

    if (stationId) {
      query += ` WHERE station_id = ?`;
      params.push(stationId);
    }

    query += ` ORDER BY created_at DESC LIMIT 50`;

    const rawJobs = await queryD1<PrintJobRecord & { expires_at?: string; file_key?: string }>(query, params);
    const now = Date.now();
    const jobs = rawJobs.map((job) => {
      const isExpired = job.expires_at ? new Date(job.expires_at).getTime() <= now : false;
      const isPurged = !job.file_key || (isExpired && (job.status === 'COMPLETED' || job.status === 'FAILED'));
      return {
        ...job,
        is_purged: isPurged,
      };
    });

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

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    if (!(await isAuthorized(req, stationId))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Clear All Completed/Failed History
    if (action === 'clear_history') {
      let query = `SELECT id, file_key FROM print_jobs WHERE status IN ('COMPLETED', 'FAILED')`;
      const params: string[] = [];
      if (stationId) {
        query += ` AND station_id = ?`;
        params.push(stationId);
      }
      const historyJobs = await queryD1<{ id: string; file_key: string }>(query, params);

      // Purge files from R2
      for (const hj of historyJobs) {
        if (hj.file_key) {
          try {
            await deleteFromR2(hj.file_key);
          } catch (r2Err) {
            console.warn(`Failed to delete ${hj.file_key} from R2:`, r2Err);
          }
        }
      }

      // Delete rows from D1
      let deleteSql = `DELETE FROM print_jobs WHERE status IN ('COMPLETED', 'FAILED')`;
      if (stationId) {
        deleteSql += ` AND station_id = ?`;
      }
      await executeD1(deleteSql, params);

      return NextResponse.json({
        success: true,
        clearedCount: historyJobs.length,
        message: `Successfully cleared ${historyJobs.length} job(s) from history and purged files`,
      });
    }

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    // Verify job exists
    const jobs = await queryD1<PrintJobRecord>(
      `SELECT id, status, pickup_code, file_key, station_id FROM print_jobs WHERE id = ? LIMIT 1`,
      [jobId]
    );
    if (jobs.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = jobs[0];

    // 2. Delete single job from history & purge R2 file
    if (action === 'delete') {
      if (job.file_key) {
        try {
          await deleteFromR2(job.file_key);
        } catch (r2Err) {
          console.warn(`Failed to delete ${job.file_key} from R2:`, r2Err);
        }
      }
      await executeD1(`DELETE FROM print_jobs WHERE id = ?`, [jobId]);

      return NextResponse.json({
        success: true,
        jobId,
        message: `Job ${job.pickup_code} permanently deleted and purged`,
      });
    }

    // 3. Purge file only (retain order in history)
    if (action === 'purge_file') {
      if (job.file_key) {
        try {
          await deleteFromR2(job.file_key);
        } catch (r2Err) {
          console.warn(`Failed to delete ${job.file_key} from R2:`, r2Err);
        }
      }
      await executeD1(`UPDATE print_jobs SET file_key = NULL WHERE id = ?`, [jobId]);

      return NextResponse.json({
        success: true,
        jobId,
        message: `Cloud document for ${job.pickup_code} permanently wiped`,
      });
    }

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

