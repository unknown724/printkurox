import { NextRequest, NextResponse } from 'next/server';
import { queryD1, executeD1, PrinterSuppliesRecord, PrinterTelemetryRecord } from '@/lib/cloudflare-d1';
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const suppliesRows = await queryD1<PrinterSuppliesRecord>(
      `SELECT * FROM printer_supplies WHERE id = 1 LIMIT 1`
    );
    const telemetryRows = await queryD1<PrinterTelemetryRecord>(
      `SELECT * FROM printer_telemetry WHERE id = 1 LIMIT 1`
    );

    const supplies = suppliesRows[0] || {
      id: 1,
      black_pages_remaining: 4500,
      color_pages_remaining: 7500,
      black_capacity: 4500,
      color_capacity: 7500,
      paper_sheets_remaining: 500,
      paper_capacity: 500,
      last_black_refill: null,
      last_color_refill: null,
      last_paper_refill: null,
      updated_at: new Date().toISOString(),
    };

    const telemetry = telemetryRows[0] || {
      id: 1,
      printer_name: 'EPSON L3210 Series',
      is_online: 1,
      status_code: 2,
      status_text: 'Normal',
      spooler_jobs: 0,
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      supplies,
      telemetry,
    });
  } catch (err: unknown) {
    console.error('Error fetching supplies:', err);
    return NextResponse.json({ error: 'Failed to query supplies' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, amount, blackCapacity, colorCapacity, paperCapacity } = body;

    const currentRows = await queryD1<PrinterSuppliesRecord>(
      `SELECT * FROM printer_supplies WHERE id = 1 LIMIT 1`
    );
    const current = currentRows[0] || {
      black_capacity: 4500,
      color_capacity: 7500,
      paper_capacity: 500,
      black_pages_remaining: 4500,
      color_pages_remaining: 7500,
      paper_sheets_remaining: 500,
    };

    if (action === 'refill_black') {
      const topUp = typeof amount === 'number' ? amount : current.black_capacity;
      await executeD1(
        `UPDATE printer_supplies 
         SET black_pages_remaining = ?, last_black_refill = datetime('now'), updated_at = datetime('now')
         WHERE id = 1`,
        [topUp]
      );
    } else if (action === 'refill_color') {
      const topUp = typeof amount === 'number' ? amount : current.color_capacity;
      await executeD1(
        `UPDATE printer_supplies 
         SET color_pages_remaining = ?, last_color_refill = datetime('now'), updated_at = datetime('now')
         WHERE id = 1`,
        [topUp]
      );
    } else if (action === 'refill_paper') {
      const topUp = typeof amount === 'number' ? amount : current.paper_capacity;
      await executeD1(
        `UPDATE printer_supplies 
         SET paper_sheets_remaining = ?, last_paper_refill = datetime('now'), updated_at = datetime('now')
         WHERE id = 1`,
        [topUp]
      );
    } else if (action === 'calibrate') {
      await executeD1(
        `UPDATE printer_supplies 
         SET black_capacity = COALESCE(?, black_capacity),
             color_capacity = COALESCE(?, color_capacity),
             paper_capacity = COALESCE(?, paper_capacity),
             updated_at = datetime('now')
         WHERE id = 1`,
        [blackCapacity || null, colorCapacity || null, paperCapacity || null]
      );
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Return updated record
    const updated = await queryD1<PrinterSuppliesRecord>(
      `SELECT * FROM printer_supplies WHERE id = 1 LIMIT 1`
    );

    return NextResponse.json({
      success: true,
      supplies: updated[0],
    });
  } catch (err: unknown) {
    console.error('Error updating supplies:', err);
    return NextResponse.json({ error: 'Failed to update supplies' }, { status: 500 });
  }
}
