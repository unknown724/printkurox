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
      amount: directAmount,
      currency: directCurrency = 'INR',
      receipt: directReceipt,
      notes: directNotes,
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

    let amountInPaise = 0;
    let currency = directCurrency || 'INR';
    let receipt = directReceipt;
    let orderNotes = directNotes || {};

    let jobId: string | undefined;
    let pickupCode: string | undefined;
    let pricing: ReturnType<typeof calculatePricing> | undefined;

    // Check if this is a direct amount request or a print kiosk order
    if (directAmount !== undefined && directAmount !== null) {
      amountInPaise = Math.round(Number(directAmount));
      if (!receipt) {
        receipt = `rcpt_direct_${Date.now()}`;
      }
    } else {
      // Print Kiosk Order validation
      if (!fileKey || !fileName || !docPages) {
        return NextResponse.json(
          { error: 'Missing required print parameters (fileKey, fileName, docPages) or direct amount' },
          { status: 400 }
        );
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

      // 2. Strict Server-Side Pricing Calculation
      pricing = calculatePricing({
        totalPages: activePagesCount,
        colorMode: colorMode,
        isDuplex: Boolean(isDuplex),
        copies: Math.max(1, Math.floor(copies)),
        pageConfigs: pageConfigs && Array.isArray(pageConfigs) && pageConfigs.length > 0 ? pageConfigs : undefined,
      });

      amountInPaise = Math.round(pricing.totalPrice * 100);

      // 3. Generate unique pickup code
      pickupCode = generateRandomPickupCode();
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

      receipt = `rcpt_${pickupCode.replace('#', '')}_${Date.now().toString().slice(-6)}`;
      orderNotes = {
        pickupCode,
        file_name: fileName,
        copies: String(copies),
        pages: String(activePagesCount),
        is_duplex: String(isDuplex),
      };
    }

    // Minimum amount validation: Razorpay requires >= 100 paise (₹1.00)
    if (isNaN(amountInPaise) || amountInPaise < 100) {
      return NextResponse.json(
        { error: 'Minimum order amount must be at least 100 paise (₹1.00)' },
        { status: 400 }
      );
    }

    // 4. Configure and Call Razorpay API
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    if (!keyId || !keySecret) {
      console.error('Razorpay credentials missing in environment variables');
      return NextResponse.json(
        { error: 'Razorpay API credentials not configured on server' },
        { status: 500 }
      );
    }

    let rzpOrder;
    try {
      const razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });

      rzpOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency,
        receipt,
        notes: orderNotes,
      });
    } catch (rzpErr: unknown) {
      console.error('Razorpay order creation API error:', rzpErr);
      const errObj = rzpErr as { statusCode?: number; error?: { description?: string; code?: string }; message?: string };
      const statusCode = errObj.statusCode === 401 ? 401 : 500;
      const errorMessage = errObj.error?.description || errObj.message || 'Failed to create Razorpay order';
      return NextResponse.json({ error: errorMessage }, { status: statusCode });
    }

    const razorpayOrderId = rzpOrder.id;

    // 5. If this is a Print Kiosk Job, insert record into Cloudflare D1
    if (fileKey && fileName && pickupCode && pricing) {
      jobId = crypto.randomUUID();
      const now = new Date();
      const createdAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

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
          pricing.totalPages,
          pageRange,
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
    }

    // Return standard Razorpay checkout response format
    return NextResponse.json({
      success: true,
      order_id: razorpayOrderId,
      orderId: razorpayOrderId,
      amount: amountInPaise,
      currency,
      keyId,
      jobId,
      pickupCode,
      pricing,
    });
  } catch (err: unknown) {
    console.error('Create order error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
