import { NextResponse } from 'next/server';
import { queryD1, executeD1, PrintJobRecord } from '@/lib/cloudflare-d1';
import { deleteFromR2, purgeExpiredR2Files } from '@/lib/cloudflare-r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const nowIso = new Date().toISOString();

    // 1. Find all expired jobs
    const expiredJobs = await queryD1<PrintJobRecord>(
      'SELECT id, file_key FROM print_jobs WHERE expires_at < ?',
      [nowIso]
    );

    // 2. Delete corresponding R2 files
    for (const job of expiredJobs) {
      if (job.file_key) {
        try {
          await deleteFromR2(job.file_key);
        } catch (r2Err) {
          console.warn(`Failed to delete R2 file ${job.file_key}:`, r2Err);
        }
      }
    }

    // 3. Purge expired jobs from D1
    if (expiredJobs.length > 0) {
      await executeD1('DELETE FROM print_jobs WHERE expires_at < ?', [nowIso]);
    }

    // 4. Also run R2 cleanup sweep
    await purgeExpiredR2Files(15);

    return NextResponse.json({
      success: true,
      cleanedCount: expiredJobs.length,
      timestamp: nowIso,
    });
  } catch (err: unknown) {
    console.error('Cleanup error:', err);
    const message = err instanceof Error ? err.message : 'Cleanup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
