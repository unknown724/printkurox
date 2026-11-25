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
    const payment_link_id = body.razorpay_payment_link_id || body.payment_link_id;
    const payment_link_ref = body.razorpay_payment_link_reference_id || body.payment_link_reference_id || '';
    const payment_link_status = body.razorpay_payment_link_status || body.payment_link_status || '';
    const jobId = body.jobId;

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || '';
    if (!keySecret) {
      console.error('RAZORPAY_KEY_SECRET is not configured in server environment');
      return NextResponse.json({ error: 'Payment gateway configuration error' }, { status: 500 });
    }

    let resolvedOrderId = order_id as string | undefined;
    let resolvedPaymentId = payment_id as string | undefined;

    if (payment_link_id && payment_id && signature && payment_link_status) {
      // Razorpay Payment Link callback verification:
      // HMAC-SHA256(payment_link_id + "|" + reference_id + "|" + status + "|" + payment_id, KEY_SECRET)
      const plPayload = `${payment_link_id}|${payment_link_ref}|${payment_link_status}|${payment_id}`;
      const expectedPlSig = crypto
        .createHmac('sha256', keySecret)
        .update(plPayload)
        .digest('hex');
      const sigBuffer = Buffer.from(String(signature).trim());
      const expBuffer = Buffer.from(expectedPlSig.trim());
      if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
        return NextResponse.json({ error: 'Invalid payment link signature' }, { status: 400 });
      }
      if (String(payment_link_status).toLowerCase() !== 'paid') {
        return NextResponse.json({ error: 'Payment link is not marked paid yet' }, { status: 400 });
      }
      resolvedOrderId = String(payment_link_id);
      resolvedPaymentId = String(payment_id);
    } else if (payment_link_id && keyId) {
      // Direct Razorpay REST check for Hosted Payment Link status
      const basicAuth = Buffer.from(`${keyId.trim()}:${keySecret}`).toString('base64');
      const plRes = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(String(payment_link_id))}`, {
        headers: { Authorization: `Basic ${basicAuth}` },
        cache: 'no-store',
      });
      const plData = await plRes.json().catch(() => ({})) as {
        id?: string;
        status?: string;
        payments?: Array<{ payment_id?: string }>;
      };
      if (!plRes.ok || plData.status !== 'paid') {
        return NextResponse.json({ error: 'Payment link has not settled yet' }, { status: 402 });
      }
      resolvedOrderId = plData.id || String(payment_link_id);
      resolvedPaymentId = resolvedPaymentId || plData.payments?.[0]?.payment_id || `plink_${resolvedOrderId}`;
    } else {
      // 1. Validate required standard order verification parameters
      if (!order_id || !payment_id || !signature) {
        return NextResponse.json(
          {
            error: 'Missing required Razorpay verification fields (order_id, payment_id, signature)',
          },
          { status: 400 }
        );
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
      if ((!jobs || jobs.length === 0) && resolvedOrderId) {
        jobs = await queryD1<PrintJobRecord>(
          'SELECT id, order_id, status, pickup_code, total_price FROM print_jobs WHERE order_id = ?',
          [resolvedOrderId]
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
      if (matchedJob.order_id && resolvedOrderId && matchedJob.order_id !== resolvedOrderId) {
        console.error(`Order ID mismatch! DB order: ${matchedJob.order_id}, received: ${resolvedOrderId}`);
        return NextResponse.json({ error: 'Order ID does not match print job' }, { status: 400 });
      }

      // Update status if pending
      if (matchedJob.status === 'PENDING_PAYMENT') {
        await executeD1(
          `UPDATE print_jobs 
           SET status = 'PAID', payment_id = ?
           WHERE id = ? AND status = 'PENDING_PAYMENT'`,
          [resolvedPaymentId || null, matchedJob.id]
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
