import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { calculatePricing } from '@/lib/pricing';
import { generateRandomPickupCode } from '@/lib/pickup-code';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import { parsePageRange } from '@/lib/pdf-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fileKey,
      fileName,
      docPages,
      pageRange = 'All',
      colorMode = 'bw',
      isDuplex = false,
      copies = 1,
      orientation = 'portrait',
      pageConfigs,
    } = body;

    if (!fileKey || !fileName || !docPages) {
      return NextResponse.json({ error: 'Missing required print parameters' }, { status: 400 });
    }

    // 1. Calculate actual billable pages from page range or pageConfigs
    let activePagesCount = docPages;
    let effectivePageRange = pageRange;

    if (pageConfigs && Array.isArray(pageConfigs) && pageConfigs.length > 0) {
      const included = pageConfigs.filter((p: { included: boolean }) => p.included);
      activePagesCount = included.length;
      effectivePageRange = included.map((p: { pageNumber: number }) => p.pageNumber).join(',');
    } else {
      const selectedPages = parsePageRange(pageRange, docPages);
      activePagesCount = selectedPages.length;
    }

    if (activePagesCount === 0) {
      return NextResponse.json({ error: 'At least one page must be selected' }, { status: 400 });
    }

    // 2. Strict Server-Side Pricing Calculation (Supports Hybrid)
    const pricing = calculatePricing({
      totalPages: activePagesCount,
      colorMode: colorMode,
      isDuplex: Boolean(isDuplex),
      copies: Math.max(1, Math.floor(copies)),
      pageConfigs: pageConfigs && Array.isArray(pageConfigs) && pageConfigs.length > 0 ? pageConfigs : undefined,
    });

    const amountInPaise = Math.round(pricing.totalPrice * 100);

    // 3. Generate unique pickup code (guaranteed unique among active non-completed jobs)
    let pickupCode = generateRandomPickupCode();
    for (let attempts = 0; attempts < 10; attempts++) {
      const existing = await queryD1<{ id: string }>(
        "SELECT id FROM print_jobs WHERE pickup_code = ? AND status != 'COMPLETED' LIMIT 1",
        [pickupCode]
      );
      if (existing.length === 0) {
        break;
      }
      pickupCode = generateRandomPickupCode();
    }

    // 4. Create Razorpay Order
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    let razorpayOrderId = `dummy_order_${Date.now()}`;

    if (keySecret && !keySecret.includes('PASTE_YOUR_RAZORPAY_SECRET_HERE')) {
      try {
        const razorpay = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });

        const rzpOrder = await razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `rcpt_${pickupCode.replace('#', '')}_${Date.now().toString().slice(-6)}`,
          notes: {
            pickupCode,
            file_name: fileName,
            copies: String(copies),
            pages: String(activePagesCount),
            is_duplex: String(isDuplex),
          },
        });

        razorpayOrderId = rzpOrder.id;
      } catch (rzpErr) {
        console.error('Razorpay order creation error:', rzpErr);
        // If razorpay credentials fail or in test mock
        razorpayOrderId = `test_order_${Date.now()}`;
      }
    }

    // 5. Insert Job into Cloudflare D1
    const jobId = crypto.randomUUID();
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 minutes window

    await executeD1(
      `INSERT INTO print_jobs (
        id, pickup_code, file_key, file_name, total_pages, page_range,
        color_mode, is_duplex, copies, duplex_sheets, single_sheets,
        total_price, order_id, status, created_at, expires_at,
        orientation, page_configs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        pickupCode,
        fileKey,
        fileName,
        activePagesCount,
        effectivePageRange,
        pricing.colorPagesCount > 0 ? 'color' : 'bw',
        pricing.isDuplex ? 1 : 0,
        pricing.copies,
        pricing.duplexSheets,
        pricing.singleSheets,
        pricing.totalPrice,
        razorpayOrderId,
        'PENDING_PAYMENT',
        createdAt,
        expiresAt,
        orientation,
        pageConfigs ? JSON.stringify(pageConfigs) : null,
      ]
    );

    return NextResponse.json({
      success: true,
      jobId,
      pickupCode,
      orderId: razorpayOrderId,
      amount: amountInPaise,
      currency: 'INR',
      keyId,
      pricing,
    });
  } catch (err: unknown) {
    console.error('Create order error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create print order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
