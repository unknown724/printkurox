import { NextRequest, NextResponse } from 'next/server';
import { queryD1, PrintJobRecord } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const rows = await queryD1<PrintJobRecord>(
      'SELECT * FROM print_jobs WHERE id = ? LIMIT 1',
      [jobId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = rows[0];
    const now = Date.now();
    const expiresAt = new Date(job.expires_at).getTime();
    const secondsRemaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
    const isExpired = secondsRemaining === 0;

    return NextResponse.json({
      id: job.id,
      pickupCode: job.pickup_code,
      status: job.status,
      fileName: job.file_name,
      totalPages: job.total_pages,
      pageRange: job.page_range,
      colorMode: job.color_mode,
      isDuplex: Boolean(job.is_duplex),
      copies: job.copies,
      duplexSheets: job.duplex_sheets,
      singleSheets: job.single_sheets,
      totalPrice: job.total_price,
      createdAt: job.created_at,
      expiresAt: job.expires_at,
      secondsRemaining,
      isExpired,
    });
  } catch (err: unknown) {
    console.error('Status fetch error:', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
