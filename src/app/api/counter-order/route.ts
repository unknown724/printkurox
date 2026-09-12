import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { calculatePricing } from '@/lib/pricing';
import { generateRandomPickupCode } from '@/lib/pickup-code';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import { parsePageRange } from '@/lib/pdf-utils';
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
      station_id: rawStationId,
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
        fileKey,
        fileName,
        pricing.totalPages,
        effectivePageRange,
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
