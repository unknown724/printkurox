import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { calculatePricing } from '@/lib/pricing';
import { generateRandomPickupCode } from '@/lib/pickup-code';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import { parsePageRange, transformPdfForPrint } from '@/lib/pdf-utils';
import { getFileBufferFromR2, uploadToR2 } from '@/lib/cloudflare-r2';
import { getStationConfig } from '@/lib/stations';

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
      layoutMode,
      customCols,
      customRows,
      textOverlay,
      station_id: rawStationId,
      customScale,
      fitMode,
      drawBorder,
    } = body;

    const station = getStationConfig(rawStationId);
    const stationId = station.id;

    if (!fileKey || !fileName || !docPages) {
      return NextResponse.json(
        { error: 'Missing required print parameters (fileKey, fileName, docPages)' },
        { status: 400 }
      );
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
        "SELECT id FROM print_jobs WHERE pickup_code = ? AND status != 'COMPLETED' LIMIT 1",
        [pickupCode]
      );
      if (existing.length === 0) break;
      pickupCode = generateRandomPickupCode();
    }

    const jobId = crypto.randomUUID();
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour for counter pickup
    const counterOrderId = `COUNTER_${stationId.toUpperCase()}_${Date.now().toString().slice(-6)}`;

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

    const needsTransform = Boolean(
      (customScale && Number(customScale) !== 100) ||
      (fitMode && fitMode !== 'fit') ||
      (layoutMode && layoutMode !== '1-up') ||
      (orientation && orientation !== 'auto') ||
      drawBorder ||
      (textOverlay && textOverlay.enabled) ||
      hasCustomPageConfigs ||
      (pageRange && pageRange.trim().toLowerCase() !== 'all')
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
            textOverlay,
            orientation: orientation || 'auto',
            pageConfigs,
            customScale: customScale ? Number(customScale) : 100,
            pageRange: effectivePageRange,
          }
        );

        const cleanBase = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const transformedKey = `uploads/transformed-${jobId}-${cleanBase}.pdf`;
        await uploadToR2(transformedKey, transformedBuffer, 'application/pdf');
        finalFileKey = transformedKey;
        finalDocPages = transformedPages;
        finalPageRange = 'All'; // Layout, sequence, and exclusions are baked into the PDF
      } catch (err) {
        console.error('Error transforming PDF for print in counter-order, using original file:', err);
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
        counterOrderId,
        'PENDING_PAYMENT',
        createdAt,
        expiresAt,
        orientation,
        pageConfigs ? JSON.stringify(pageConfigs) : null,
        stationId,
      ]
    );

    return NextResponse.json({
      success: true,
      jobId,
      pickupCode,
      pricing,
      station: {
        id: station.id,
        name: station.name,
        operatorName: station.operatorName,
        whatsappNumber: station.whatsappNumber,
      },
    });
  } catch (err: unknown) {
    console.error('Counter order error:', err);
    const message = err instanceof Error ? err.message : 'Failed to submit counter order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
