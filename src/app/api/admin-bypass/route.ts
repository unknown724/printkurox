import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { calculatePricing } from '@/lib/pricing';
import { generateRandomPickupCode } from '@/lib/pickup-code';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import { parsePageRange, transformPdfForPrint } from '@/lib/pdf-utils';
import { getFileBufferFromR2, uploadToR2 } from '@/lib/cloudflare-r2';
import { validateAdminPin, verifyAdminDevice, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import { validateStationPin, validateStationPinWithRoleAsync, getStationConfig, validateStationTokenAsync } from '@/lib/stations';
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
      textOverlay,
      pin,
      station_id: rawStationId,
      customScale,
      fitMode,
      drawBorder,
      autoRotate,
    } = body;

    const station = getStationConfig(rawStationId);
    const stationId = station.id;

    // Check if station admin session exists via cookie
    const stationPinCookie = req.cookies.get('station_admin_pin')?.value;
    const isStationAdmin = stationPinCookie ? validateStationPin(stationId, stationPinCookie) : false;

    // Check station token from body, header, or token-formatted pin
    const candidateToken =
      body.token ||
      req.headers.get('x-station-token') ||
      (typeof pin === 'string' && pin.startsWith('kurox_st_') ? pin : null);

    let isTokenValid = false;
    if (candidateToken) {
      try {
        const tokenAuth = await validateStationTokenAsync(candidateToken);
        if (tokenAuth.isValid && tokenAuth.station) {
          const tId = tokenAuth.station.id;
          if (
            tId === stationId ||
            tId === rawStationId ||
            tId === 'main' ||
            tId === 'block_b'
          ) {
            isTokenValid = true;
          }
        }
      } catch (tokErr) {
        console.warn('Error validating station token in admin-bypass:', tokErr);
      }
    }

    // If not already an authorized device, station admin, or valid station token, validate PIN
    if (!isDeviceAdmin && !isStationAdmin && !isTokenValid) {
      const inputPin = pin || stationPinCookie;
      const stationAuth = await validateStationPinWithRoleAsync(stationId, inputPin || '');
      const isPinValid = Boolean(inputPin && (stationAuth.isValid || validateAdminPin(inputPin)));

      if (!isPinValid) {
        // Only hit D1 for rate limiting on failed passcode attempts to prevent brute force
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

        const failResult = await recordFailedAttempt(ip);
        const status = failResult.locked ? 429 : 401;
        return NextResponse.json({ error: failResult.message }, { status });
      }
    }

    // Handle Cash Verification for In-Person Student Orders
    if (body.action === 'VERIFY_CASH') {
      const { targetJobId } = body;
      if (!targetJobId) {
        return NextResponse.json({ error: 'Missing targetJobId' }, { status: 400 });
      }
      const cashPayId = `CASH_COLLECTED_${Date.now()}`;
      const upd = await executeD1(
        `UPDATE print_jobs SET status = 'PAID', payment_id = ? WHERE id = ? AND (status = 'PENDING_PAYMENT' OR payment_id IS NULL)`,
        [cashPayId, targetJobId]
      );
      if (!upd) {
        return NextResponse.json({ error: 'Failed to approve cash order or already paid' }, { status: 400 });
      }

      // Instant local wake trigger to kiosk daemon (0ms queue polling delay)
      fetch('http://127.0.0.1:7250/poll-now', {
        method: 'POST',
        signal: AbortSignal.timeout(300),
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        jobId: targetJobId,
        paymentId: cashPayId,
        message: 'Order verified! Cash collected and print job dispatched to printer.',
      });
    }

    if (!fileKey || !fileName || !docPages) {
      return NextResponse.json({ error: 'Missing required print parameters' }, { status: 400 });
    }

    if (typeof fileKey !== 'string' || !fileKey.startsWith('uploads/') || fileKey.includes('..')) {
      return NextResponse.json({ error: 'Invalid file key' }, { status: 400 });
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

    const inputPin = pin || stationPinCookie;
    const isMasterAdmin = isDeviceAdmin || Boolean(inputPin && validateAdminPin(inputPin));
    let adminPaymentId = `ADMIN_BYPASS_${Date.now()}`;

    if (!isMasterAdmin) {
      // Check if owner printing is active on this station
      const stRow = await queryD1<{ owner_print_enabled?: number }>(
        `SELECT owner_print_enabled FROM stations WHERE id = ? OR id = ? LIMIT 1`,
        [stationId, rawStationId]
      );
      if (stRow.length > 0 && stRow[0].owner_print_enabled === 0) {
        return NextResponse.json({ error: 'Owner personal printing is currently disabled by administrator.' }, { status: 403 });
      }

      adminPaymentId = `OWNER_PRINT_${Date.now()}`;
    }

    // Generate unique pickup code (21,600 collision-resistant namespace)
    const pickupCode = generateRandomPickupCode();

    const jobId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 mins

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
        p.orientation === 'landscape'
      )
    );

    // Only perform heavy server-side PDF manipulation when physically required (e.g. converting images, N-up grid layouts, custom borders, text overlays).
    // Standard PDFs are printed natively by SumatraPDF in printer_daemon.py with orientation, copies, page range, monochrome, and fit.
    const needsTransform = Boolean(
      isNotPdf ||
      (customScale && Number(customScale) !== 100) ||
      (layoutMode && layoutMode !== '1-up') ||
      drawBorder ||
      hasTextOverlay ||
      orientation === 'landscape' ||
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
        console.error('Error transforming PDF for print in admin-bypass, using original file:', err);
      }
    }

    // Insert directly as PAID into Cloudflare D1 with orientation, page_configs, and station_id
    await executeD1(
      `INSERT INTO print_jobs (
        id, pickup_code, file_key, file_name, total_pages, page_range,
        color_mode, is_duplex, copies, duplex_sheets, single_sheets,
        total_price, status, payment_id, created_at, expires_at,
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
        0, // Admin bypass: ₹0 charged
        'PAID', // Directly queued for printing
        adminPaymentId,
        now.toISOString(),
        expiresAt.toISOString(),
        orientation,
        pageConfigs ? JSON.stringify(pageConfigs) : null,
        stationId,
      ]
    );

    // Instant local wake trigger to kiosk daemon (0ms queue polling delay)
    fetch('http://127.0.0.1:7250/poll-now', {
      method: 'POST',
      signal: AbortSignal.timeout(300),
    }).catch(() => {});

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
