import { NextRequest, NextResponse } from 'next/server';
import { queryD1, executeD1, PrintJobRecord } from '@/lib/cloudflare-d1';
import { deleteFromR2, purgeExpiredR2Files } from '@/lib/cloudflare-r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get('authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const nowIso = new Date().toISOString();
    // 2-hour grace period for completed jobs before wiping cloud file
    const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    // 48-hour cutoff for completely purging abandoned unpaid sessions
    const abandonedUnpaidCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // 1. Find completed/failed jobs older than 2 hours that still have files in R2
    const filesToPurge = await queryD1<PrintJobRecord>(
      `SELECT id, file_key, status FROM print_jobs 
       WHERE created_at < ? 
       AND status IN ('COMPLETED', 'FAILED')
       AND file_key IS NOT NULL
       AND file_key != 'ARCHIVED_LOCALLY'`,
      [twoHoursAgoIso]
    );

    // 2. Delete cloud R2 files for finished jobs & mark file_key as 'ARCHIVED_LOCALLY' in D1 (Keep record forever)
    let filesPurgedCount = 0;
    for (const job of filesToPurge) {
      if (job.file_key) {
        try {
          await deleteFromR2(job.file_key);
          await executeD1(`UPDATE print_jobs SET file_key = 'ARCHIVED_LOCALLY' WHERE id = ?`, [job.id]);
          filesPurgedCount++;
        } catch (r2Err) {
          console.warn(`Failed to delete R2 file ${job.file_key}:`, r2Err);
        }
      }
    }

    // 3. Clean up abandoned unpaid sessions (PENDING_PAYMENT older than 48 hours)
    const abandonedJobs = await queryD1<PrintJobRecord>(
      `SELECT id, file_key FROM print_jobs 
       WHERE created_at < ? 
       AND status = 'PENDING_PAYMENT'`,
      [abandonedUnpaidCutoff]
    );

    for (const job of abandonedJobs) {
      if (job.file_key) {
        try {
          await deleteFromR2(job.file_key);
        } catch (r2Err) {
          console.warn(`Failed to delete abandoned R2 file ${job.file_key}:`, r2Err);
        }
      }
    }

    if (abandonedJobs.length > 0) {
      await executeD1(
        `DELETE FROM print_jobs 
         WHERE created_at < ? 
         AND status = 'PENDING_PAYMENT'`,
        [abandonedUnpaidCutoff]
      );
    }

    // 4. Run R2 cleanup sweep with safe 60-minute window for unlinked orphaned files
    await purgeExpiredR2Files(60);

    return NextResponse.json({
      success: true,
      filesPurgedCount,
      abandonedCleanedCount: abandonedJobs.length,
      note: 'Completed job records and financial history are preserved permanently in D1.',
      timestamp: nowIso,
    });
  } catch (err: unknown) {
    console.error('Cleanup error:', err);
    const message = err instanceof Error ? err.message : 'Cleanup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
