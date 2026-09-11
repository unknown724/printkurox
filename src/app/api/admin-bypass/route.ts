import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { calculatePricing } from '@/lib/pricing';
import { generateRandomPickupCode } from '@/lib/pickup-code';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import { parsePageRange } from '@/lib/pdf-utils';
import { validateAdminPin, verifyAdminDevice, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import { checkRateLimit, recordFailedAttempt, resetFailedAttempts } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const deviceId = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const { isValid: isDeviceAdmin } = await verifyAdminDevice(deviceId || '');

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
      layoutMode,
      customCols,
      customRows,
      pin,
    } = body;

    // If not already an authorized device, we must validate PIN with rate-limit protection
    if (!isDeviceAdmin) {
      // 1. Check rate limit
      const rateCheck = await checkRateLimit(ip);
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: rateCheck.message },
          { 
            status: 429,
            headers: { 'Retry-After': String(rateCheck.retryAfterSeconds || 900) }
          }
        );
      }

      // 2. Check PIN
      if (!pin || !validateAdminPin(pin)) {
        const failResult = await recordFailedAttempt(ip);
        const status = failResult.locked ? 429 : 401;
        return NextResponse.json({ error: failResult.message }, { status });
      }

      // 3. Reset rate limits on success
      await resetFailedAttempts(ip);
    }

    if (!fileKey || !fileName || !docPages) {
      return NextResponse.json({ error: 'Missing required print parameters' }, { status: 400 });
    }

    // Calculate actual billable pages from page range or pageConfigs
    let activePagesCount = docPages;
    let effectivePageRange = pageRange;

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
      const selectedPages = parsePageRange(pageRange, docPages);
      activePagesCount = selectedPages.length;
    }

    if (activePagesCount === 0) {
      return NextResponse.json({ error: 'At least one page must be selected' }, { status: 400 });
    }

    const pricing = calculatePricing({
      totalPages: activePagesCount,
      colorMode: colorMode,
      isDuplex: Boolean(isDuplex),
      copies: Math.max(1, Math.floor(copies)),
      pageConfigs: pageConfigs && Array.isArray(pageConfigs) && pageConfigs.length > 0 ? pageConfigs : undefined,
      layoutMode,
      customCols,
      customRows,
    });

    // Generate unique pickup code
    let pickupCode = generateRandomPickupCode();
    for (let attempts = 0; attempts < 10; attempts++) {
      const existing = await queryD1<{ id: string }>(
        `SELECT id FROM print_jobs WHERE pickup_code = ? AND created_at >= datetime('now', '-24 hours') LIMIT 1`,
        [pickupCode]
      );
      if (existing.length === 0) break;
      pickupCode = generateRandomPickupCode();
    }

    const jobId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 mins
    const adminPaymentId = `ADMIN_BYPASS_${Date.now()}`;

    // Insert directly as PAID into Cloudflare D1 with orientation and page_configs
    await executeD1(
      `INSERT INTO print_jobs (
        id, pickup_code, file_key, file_name, total_pages, page_range,
        color_mode, is_duplex, copies, duplex_sheets, single_sheets,
        total_price, status, payment_id, created_at, expires_at,
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
        0, // Admin bypass: ₹0 charged
        'PAID', // Directly queued for printing
        adminPaymentId,
        now.toISOString(),
        expiresAt.toISOString(),
        orientation,
        pageConfigs ? JSON.stringify(pageConfigs) : null,
      ]
    );

    return NextResponse.json({
      success: true,
      jobId,
      pickupCode,
      message: 'Admin bypass authorized. Job queued for immediate printing.',
    });
  } catch (err: unknown) {
    console.error('Error in admin bypass API:', err);
    const msg = err instanceof Error ? err.message : 'Admin bypass failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
