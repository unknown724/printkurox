import { NextRequest, NextResponse } from 'next/server';
import { queryD1 } from '@/lib/cloudflare-d1';
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jobs = await queryD1(
      `SELECT id, pickup_code, file_name, file_key, total_pages, color_mode, is_duplex, copies, total_price, status, payment_id, created_at
       FROM print_jobs
       ORDER BY created_at DESC
       LIMIT 25`
    );

    return NextResponse.json({ success: true, jobs });
  } catch (err: unknown) {
    console.error('Error fetching admin jobs:', err);
    return NextResponse.json({ error: 'Failed to query jobs' }, { status: 500 });
  }
}
