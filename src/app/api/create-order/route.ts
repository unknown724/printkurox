import { NextRequest, NextResponse } from 'next/server';
import { calculatePricing } from '@/lib/pricing';
import { generateRandomPickupCode } from '@/lib/pickup-code';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import { parsePageRange, transformPdfForPrint, getPdfPageCount } from '@/lib/pdf-utils';
import { getFileBufferFromR2, uploadToR2 } from '@/lib/cloudflare-r2';
import { getStationConfig } from '@/lib/stations';
import { getStationPricing, buildTierRatesFromConfig } from '@/lib/station-pricing';

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
      layoutMode,
      customCols,
      customRows,
      textOverlay,
      station_id: rawStationId,
      customScale,
      fitMode,
      drawBorder,
      autoRotate,
      promoCode,
      phone,
      checkoutMode = 'modal',
      existingJobId,
    } = body;

    const station = getStationConfig(rawStationId);
    const stationId = station.id;
    const isPaymentLinkMode = checkoutMode === 'payment_link';

    // Handle upgrading an existing PENDING_PAYMENT job (e.g. after modal domain error) to a Hosted Razorpay Payment Link
    if (isPaymentLinkMode && existingJobId && typeof existingJobId === 'string') {
      const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
      const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
      if (!keyId || !keySecret) {
        return NextResponse.json({ error: 'Razorpay API credentials not configured on server' }, { status: 500 });
      }
      const rows = await queryD1<{
        id: string;
        pickup_code: string;
        file_name: string;
        total_price: number;
        total_pages: number;
        copies: number;
        status: string;
      }>(
        `SELECT id, pickup_code, file_name, total_price, total_pages, copies, status FROM print_jobs WHERE id = ? LIMIT 1`,
        [existingJobId]
      );
      const existingJob = rows?.[0];
      if (!existingJob || existingJob.status !== 'PENDING_PAYMENT') {
        return NextResponse.json({ error: 'Pending print job not found for payment link' }, { status: 404 });
      }
      const amountInPaise = Math.max(100, Math.round(Number(existingJob.total_price) * 100));
      const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
      const customerContact = /^[6-9]\d{9}$/.test(cleanPhone) ? `+91${cleanPhone}` : '+919362980761';
      const reqOrigin = req.nextUrl.origin || 'https://printkurox.pages.dev';
      const basicAuth = Buffer.from(`${keyId.trim()}:${keySecret.trim()}`).toString('base64');
      const plRes = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: 'INR',
          accept_partial: false,
          reference_id: existingJob.id.replace(/-/g, '').slice(0, 32),
          description: `PrintKurox ${existingJob.pickup_code} - ${existingJob.total_pages}p x ${existingJob.copies}`,
          customer: {
            name: 'Student',
            contact: customerContact,
          },
          notify: { sms: false, email: false },
          reminder_enable: false,
          callback_url: `${reqOrigin}/status/${existingJob.id}`,
          callback_method: 'get',
          notes: {
            jobId: existingJob.id,
            pickupCode: existingJob.pickup_code,
            station_id: station.id,
          },
        }),
        cache: 'no-store',
      });
      const plData = await plRes.json().catch(() => ({})) as {
        id?: string;
        short_url?: string;
        error?: { description?: string };
      };
      if (!plRes.ok || !plData.id || !plData.short_url) {
        return NextResponse.json(
          { error: plData.error?.description || 'Failed to create Razorpay Hosted Payment Link' },
          { status: 500 }
        );
      }
      await executeD1(`UPDATE print_jobs SET order_id = ? WHERE id = ?`, [plData.id, existingJob.id]);
      return NextResponse.json({
        success: true,
        checkoutMode: 'payment_link',
        paymentLinkUrl: plData.short_url,
        paymentLinkId: plData.id,
        order_id: plData.id,
        orderId: plData.id,
        amount: amountInPaise,
        currency: 'INR',
        keyId,
        jobId: existingJob.id,
        pickupCode: existingJob.pickup_code,
      });
    }

    let amountInPaise = 0;
    const currency = directCurrency || 'INR';
    let receipt = directReceipt;
    let orderNotes = directNotes || {};
    if (phone) {
      orderNotes = { ...orderNotes, student_phone: String(phone) };
    }

    let jobId: string | undefined;
    let pickupCode: string | undefined;
    let pricing: ReturnType<typeof calculatePricing> | undefined;
    let effectivePageRange = pageRange;

    // Check if this is a direct amount request or a print kiosk order
    if (directAmount !== undefined && directAmount !== null) {
      amountInPaise = Math.round(Number(directAmount));
      receipt = directReceipt || `rcpt_direct_${Date.now().toString().slice(-8)}`;
      orderNotes = {
        ...orderNotes,
        type: 'direct_payment',
      };
    } else {
      // Print Kiosk Order validation
      if (!fileKey || !fileName || !docPages) {
        return NextResponse.json(
          { error: 'Missing required print parameters (fileKey, fileName, docPages) or direct amount' },
          { status: 400 }
        );
      }

      if (typeof fileKey !== 'string' || !fileKey.startsWith('uploads/') || fileKey.includes('..')) {
        return NextResponse.json({ error: 'Invalid file key' }, { status: 400 });
      }

      // Enforce station online payment policy
      if (!station.allowOnlinePayment) {
        return NextResponse.json(
          { error: `Online payments are currently disabled for station ${station.name}. Please pay at the counter.` },
          { status: 403 }
        );
      }

      // 1. Fast server-side validation of document page count
      const verifiedDocPages = Math.max(1, Math.floor(Number(docPages) || 1));

      // Calculate actual billable pages from page range or pageConfigs
      let activePagesCount = verifiedDocPages;

      if (pageConfigs && Array.isArray(pageConfigs) && pageConfigs.length > 0) {
        const included = pageConfigs.filter((p: { included: boolean }) => p.included);
        const sequence: number[] = [];
        included.forEach((p: { copies?: number; pageNumber: number }) => {
          const c = Math.max(1, Math.floor(p.copies || 1));
          for (let i = 0; i < c; i++) {
            sequence.push(p.pageNumber);
          }
        });
        activePagesCount = sequence.length;
        effectivePageRange = sequence.join(',');
      } else {
        const selectedPages = parsePageRange(pageRange, verifiedDocPages);
        activePagesCount = selectedPages.length;
      }

      if (activePagesCount === 0) {
        return NextResponse.json({ error: 'At least one page must be selected' }, { status: 400 });
      }

      // 2. Strict Server-Side Pricing Calculation using Station Custom Rates
      const stationPricing = await getStationPricing(station.id);
      const tierRates = buildTierRatesFromConfig(stationPricing);

      pricing = calculatePricing({
        totalPages: activePagesCount,
        colorMode: colorMode,
        isDuplex: Boolean(isDuplex),
        copies: Math.max(1, Math.floor(copies)),
        pageConfigs: pageConfigs && Array.isArray(pageConfigs) && pageConfigs.length > 0 ? pageConfigs : undefined,
        layoutMode,
        customCols,
        customRows,
        customRates: tierRates,
        promoCode: typeof promoCode === 'string' ? promoCode.trim().toUpperCase() : undefined,
      });

      amountInPaise = Math.round(pricing.totalPrice * 100);

      // 3. Generate unique pickup code (21,600 collision-resistant namespace)
      pickupCode = generateRandomPickupCode();

      receipt = `rcpt_${pickupCode.replace('#', '')}_${Date.now().toString().slice(-6)}`;
      orderNotes = {
        pickupCode,
        file_name: fileName,
        copies: String(copies),
        pages: String(activePagesCount),
        is_duplex: String(isDuplex),
        ...(promoCode ? { promo_code: String(promoCode).trim().toUpperCase() } : {}),
        ...(textOverlay?.enabled && textOverlay.text ? { text_overlay: textOverlay.text } : {}),
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

    let rzpOrder: { id: string; amount: number; currency: string; shortUrl?: string };
    const createdJobId = fileKey && fileName && pickupCode && pricing ? crypto.randomUUID() : undefined;
    try {
      const basicAuth = Buffer.from(`${keyId.trim()}:${keySecret.trim()}`).toString('base64');
      if (isPaymentLinkMode) {
        const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
        const customerContact = /^[6-9]\d{9}$/.test(cleanPhone) ? `+91${cleanPhone}` : '+919362980761';
        const reqOrigin = req.nextUrl.origin || 'https://printkurox.pages.dev';
        const plPayload = {
          amount: amountInPaise,
          currency,
          accept_partial: false,
          reference_id: (createdJobId || receipt || `pk${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32),
          description: pickupCode
            ? `PrintKurox ${pickupCode} - ${pricing?.totalPages || 1}p x ${pricing?.copies || 1}`
            : 'PrintKurox Order',
          customer: {
            name: 'Student',
            contact: customerContact,
          },
          notify: { sms: false, email: false },
          reminder_enable: false,
          ...(createdJobId ? { callback_url: `${reqOrigin}/status/${createdJobId}`, callback_method: 'get' } : {}),
          notes: {
            ...orderNotes,
            ...(createdJobId ? { jobId: createdJobId } : {}),
            station_id: station.id,
          },
        };
        const plRes = await fetch('https://api.razorpay.com/v1/payment_links', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(plPayload),
          cache: 'no-store',
        });
        const plData = await plRes.json().catch(() => ({})) as {
          id?: string;
          amount?: number;
          currency?: string;
          short_url?: string;
          error?: { description?: string };
        };
        if (!plRes.ok || !plData.id || !plData.short_url) {
          const statusCode = plRes.status === 401 ? 401 : 500;
          return NextResponse.json(
            { error: plData.error?.description || `Razorpay Payment Link error (${plRes.status})` },
            { status: statusCode }
          );
        }
        rzpOrder = {
          id: plData.id,
          amount: Number(plData.amount ?? amountInPaise),
          currency: String(plData.currency || currency),
          shortUrl: plData.short_url,
        };
      } else {
        // Direct 100% Settlement to Primary Razorpay Account (REST fetch for Edge/Worker compatibility)
        const orderPayload: Record<string, unknown> = {
          amount: amountInPaise,
          currency,
          receipt,
          notes: {
            ...orderNotes,
            station_id: station.id,
          },
        };

        const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(orderPayload),
          cache: 'no-store',
        });

        const rzpData = await rzpRes.json().catch(() => ({})) as {
          id?: string;
          amount?: number;
          currency?: string;
          error?: { description?: string; code?: string };
        };

        if (!rzpRes.ok || !rzpData.id) {
          const statusCode = rzpRes.status === 401 ? 401 : 500;
          const errorMessage = rzpData.error?.description || `Razorpay API error (${rzpRes.status})`;
          return NextResponse.json({ error: errorMessage }, { status: statusCode });
        }

        rzpOrder = {
          id: rzpData.id,
          amount: Number(rzpData.amount ?? amountInPaise),
          currency: String(rzpData.currency || currency),
        };
      }
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
      jobId = createdJobId || crypto.randomUUID();
      const now = new Date();
      const createdAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

      let finalFileKey = fileKey;
      let finalDocPages = pricing.totalPages;
      let finalPageRange = effectivePageRange;

      const hasCustomPageConfigs =
        Array.isArray(pageConfigs) &&
        pageConfigs.some(
          (p: { included?: boolean; rotation?: number; customScale?: number; copies?: number }) =>
            p.included === false ||
            (p.rotation && p.rotation !== 0) ||
            (p.customScale && p.customScale !== 100) ||
            (p.copies && p.copies > 1)
        );

      const hasTextOverlay = Boolean(
        textOverlay && (
          textOverlay.enabled ||
          (Array.isArray(textOverlay.items) && textOverlay.items.some((it: { text?: string }) => it.text && it.text.trim().length > 0)) ||
          (typeof textOverlay.text === 'string' && textOverlay.text.trim().length > 0)
        )
      );

      const isNotPdf = Boolean(fileName && !fileName.toLowerCase().endsWith('.pdf'));

      const hasPageOverrides = Boolean(
        Array.isArray(pageConfigs) &&
        pageConfigs.some((p: { rotation?: number; customScale?: number; included?: boolean; orientation?: string }) =>
          (p.rotation && p.rotation !== 0) ||
          (p.customScale && p.customScale !== 100) ||
          p.included === false ||
          p.orientation === 'landscape' ||
          p.orientation === 'portrait'
        )
      );

      // Perform server-side PDF manipulation when layout, orientation, rotation, scale, or overlays are adjusted
      const needsTransform = Boolean(
        isNotPdf ||
        (customScale && Number(customScale) !== 100) ||
        (layoutMode && layoutMode !== '1-up') ||
        drawBorder ||
        hasTextOverlay ||
        orientation === 'landscape' ||
        orientation === 'portrait' ||
        hasPageOverrides
      );

      if (needsTransform) {
        try {
          const originalBuffer = await getFileBufferFromR2(fileKey);
          const { transformedBuffer, totalPages: transformedPages } = await transformPdfForPrint(
            originalBuffer,
            fileName,
            {
              layoutMode: layoutMode || '1-up',
              customCols: customCols ? Number(customCols) : undefined,
              customRows: customRows ? Number(customRows) : undefined,
              fitMode: fitMode || 'fit',
              drawBorder: Boolean(drawBorder),
              autoRotate: autoRotate ?? true,
              textOverlay,
              orientation: orientation || 'auto',
              pageConfigs,
              customScale: customScale ? Number(customScale) : 100,
              pageRange: effectivePageRange,
            }
          );

          const cleanBase = fileName.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9.-]/g, '_');
          const transformedKey = `uploads/transformed-${jobId}-${cleanBase}.pdf`;
          await uploadToR2(transformedKey, transformedBuffer, 'application/pdf');
          finalFileKey = transformedKey;
          finalDocPages = transformedPages;
          finalPageRange = 'All'; // Layout, sequence, and exclusions are baked into the PDF
        } catch (err) {
          console.error('Error transforming PDF for print in create-order, using original file:', err);
        }
      }

      await executeD1(
        `INSERT INTO print_jobs (
          id, pickup_code, file_key, file_name, total_pages, page_range,
          color_mode, is_duplex, copies, duplex_sheets, single_sheets,
          total_price, order_id, status, created_at, expires_at,
          orientation, page_configs, station_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          jobId,
          pickupCode,
          finalFileKey,
          fileName,
          finalDocPages,
          finalPageRange,
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
          stationId,
        ]
      );
    }

    // Return standard Razorpay checkout response format
    return NextResponse.json({
      success: true,
      checkoutMode: rzpOrder.shortUrl ? 'payment_link' : 'modal',
      paymentLinkUrl: rzpOrder.shortUrl,
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
