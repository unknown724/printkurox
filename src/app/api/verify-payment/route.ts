import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { executeD1, queryD1, PrintJobRecord } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const order_id = body.razorpay_order_id || body.order_id;
    const payment_id = body.razorpay_payment_id || body.payment_id;
    const signature = body.razorpay_signature || body.signature;
    const jobId = body.jobId;

    // 1. Validate required verification parameters
    if (!order_id || !payment_id || !signature) {
      return NextResponse.json(
        {
          error: 'Missing required Razorpay verification fields (order_id, payment_id, signature)',
        },
        { status: 400 }
      );
    }

    // 2. Load and validate Secret Key from environment
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || '';
    if (!keySecret) {
      console.error('RAZORPAY_KEY_SECRET is not configured in server environment');
      return NextResponse.json({ error: 'Payment gateway configuration error' }, { status: 500 });
    }

    // 3. Cryptographic HMAC-SHA256 signature verification (Timing safe)
    // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    const sigBuffer = Buffer.from(signature.trim());
    const genBuffer = Buffer.from(generatedSignature.trim());

    if (sigBuffer.length !== genBuffer.length || !crypto.timingSafeEqual(sigBuffer, genBuffer)) {
      console.error('Tampered payment signature detected! Signature mismatch.');
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    // 4. If linked to a Print Job, fetch and atomically update status in Cloudflare D1
    let matchedJob: PrintJobRecord | null = null;
    try {
      let jobs: PrintJobRecord[] = [];
      if (jobId) {
        jobs = await queryD1<PrintJobRecord>(
          'SELECT id, order_id, status, pickup_code, total_price FROM print_jobs WHERE id = ?',
          [jobId]
        );
      }
      if ((!jobs || jobs.length === 0) && order_id) {
        jobs = await queryD1<PrintJobRecord>(
          'SELECT id, order_id, status, pickup_code, total_price FROM print_jobs WHERE order_id = ?',
          [order_id]
        );
      }
      if (jobs && jobs.length > 0) {
        matchedJob = jobs[0];
      }
    } catch (dbErr) {
      console.warn('D1 lookup notice in verify-payment:', dbErr);
    }

    if (matchedJob) {
      // Order ID validation (Prevent Cross-Job replay)
      if (matchedJob.order_id && matchedJob.order_id !== order_id) {
        console.error(`Order ID mismatch! DB order: ${matchedJob.order_id}, received: ${order_id}`);
        return NextResponse.json({ error: 'Order ID does not match print job' }, { status: 400 });
      }

      // Update status if pending
      if (matchedJob.status === 'PENDING_PAYMENT') {
        await executeD1(
          `UPDATE print_jobs 
           SET status = 'PAID', payment_id = ?
           WHERE id = ? AND status = 'PENDING_PAYMENT'`,
          [payment_id, matchedJob.id]
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      order_id,
      payment_id,
      jobId: matchedJob?.id || jobId,
      pickupCode: matchedJob?.pickup_code,
      status: 'PAID',
    });
  } catch (err: unknown) {
    console.error('Verify payment error:', err);
    const message = err instanceof Error ? err.message : 'Payment verification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
