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

    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    // Verify signature if secret is provided and not simulated
    if (
      razorpay_signature !== 'simulated_valid' &&
      keySecret &&
      !keySecret.includes('PASTE_YOUR_RAZORPAY_SECRET_HERE') &&
      razorpay_signature &&
      razorpay_order_id &&
      razorpay_payment_id
    ) {
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
      }
    }

    // Update job status in Cloudflare D1 to PAID
    await executeD1(
      `UPDATE print_jobs 
       SET status = 'PAID', payment_id = ?
       WHERE id = ?`,
      [razorpay_payment_id || 'manual_test_pay', jobId]
    );

    // Fetch the updated job
    const jobs = await queryD1<PrintJobRecord>(
      'SELECT id, pickup_code, status, total_price FROM print_jobs WHERE id = ?',
      [jobId]
    );

    const job = jobs[0];

    return NextResponse.json({
      success: true,
      jobId,
      pickupCode: job?.pickup_code,
      status: job?.status,
    });
  } catch (err: unknown) {
    console.error('Verify payment error:', err);
    const message = err instanceof Error ? err.message : 'Payment verification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
