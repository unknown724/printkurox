import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { executeD1 } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET is not configured on server');
      return NextResponse.json({ error: 'Webhook secret not configured on server' }, { status: 500 });
    }

    if (!signature) {
      return NextResponse.json({ error: 'Missing Razorpay signature' }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature.trim());
    const expBuffer = Buffer.from(expectedSignature.trim());

    if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
      console.warn('Invalid Razorpay webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (
      event.event === 'payment.captured' ||
      event.event === 'order.paid' ||
      event.event === 'payment_link.paid'
    ) {
      const orderId =
        event.payload?.payment_link?.entity?.id ||
        event.payload?.payment?.entity?.order_id ||
        event.payload?.order?.entity?.id;
      const paymentId =
        event.payload?.payment?.entity?.id ||
        event.payload?.payment_link?.entity?.payments?.[0]?.payment_id;

      if (orderId) {
        await executeD1(
          `UPDATE print_jobs 
           SET status = 'PAID', payment_id = ?
           WHERE order_id = ? AND status = 'PENDING_PAYMENT'`,
          [paymentId || null, orderId]
        );
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err: unknown) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
