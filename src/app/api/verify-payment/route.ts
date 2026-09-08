import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { executeD1, queryD1, PrintJobRecord } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const {
      jobId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await req.json();

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // 1. Fetch job from Cloudflare D1
    const jobs = await queryD1<PrintJobRecord>(
      'SELECT id, order_id, status, pickup_code, total_price FROM print_jobs WHERE id = ?',
      [jobId]
    );

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = jobs[0];

    // 2. Idempotent check: if already paid or printing, return success
    if (job.status === 'PAID' || job.status === 'COMPLETED' || job.status?.startsWith('PRINTING')) {
      return NextResponse.json({
        success: true,
        jobId,
        pickupCode: job.pickup_code,
        status: job.status,
      });
    }

    if (job.status !== 'PENDING_PAYMENT') {
      return NextResponse.json({ error: `Invalid job status: ${job.status}` }, { status: 400 });
    }

    // 3. Strict Razorpay Cryptographic Verification
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || '';
    if (!keySecret || keySecret.includes('PASTE_YOUR_RAZORPAY_SECRET_HERE')) {
      console.error('RAZORPAY_KEY_SECRET is not properly configured in environment');
      return NextResponse.json({ error: 'Payment gateway configuration error' }, { status: 500 });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'Missing required Razorpay verification parameters' },
        { status: 400 }
      );
    }

    // 4. Order ID validation (Prevent Order Hijacking & Cross-Job replay)
    if (job.order_id && job.order_id !== razorpay_order_id) {
      console.error(`Order ID mismatch! DB order: ${job.order_id}, received: ${razorpay_order_id}`);
      return NextResponse.json({ error: 'Order ID does not match print job' }, { status: 400 });
    }

    // 5. Cryptographic HMAC-SHA256 signature verification (Timing safe)
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const sigBuffer = Buffer.from(razorpay_signature.trim());
    const genBuffer = Buffer.from(generatedSignature.trim());

    if (sigBuffer.length !== genBuffer.length || !crypto.timingSafeEqual(sigBuffer, genBuffer)) {
      console.error('Tampered payment signature detected!');
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    // 6. Update job status in Cloudflare D1 to PAID atomically
    await executeD1(
      `UPDATE print_jobs 
       SET status = 'PAID', payment_id = ?
       WHERE id = ? AND status = 'PENDING_PAYMENT'`,
      [razorpay_payment_id, jobId]
    );

    return NextResponse.json({
      success: true,
      jobId,
      pickupCode: job.pickup_code,
      status: 'PAID',
    });
  } catch (err: unknown) {
    console.error('Verify payment error:', err);
    const message = err instanceof Error ? err.message : 'Payment verification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
