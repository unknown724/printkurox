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
      const pct = Math.min(100, Math.round((topUp / current.black_capacity) * 100));
      await executeD1(
        `UPDATE printer_supplies 
         SET black_pages_remaining = ?, bk_pages_remaining = ?, bk_pct = ?, last_black_refill = datetime('now'), updated_at = datetime('now')
         WHERE id = 1`,
        [topUp, topUp, pct]
      );
    } else if (action === 'refill_color') {
      const topUp = typeof amount === 'number' ? amount : current.color_capacity;
      const pct = Math.min(100, Math.round((topUp / current.color_capacity) * 100));
      await executeD1(
        `UPDATE printer_supplies 
         SET color_pages_remaining = ?, c_pages_remaining = ?, m_pages_remaining = ?, y_pages_remaining = ?,
             c_pct = ?, m_pct = ?, y_pct = ?, last_color_refill = datetime('now'), updated_at = datetime('now')
         WHERE id = 1`,
        [topUp, topUp, topUp, topUp, pct, pct, pct]
      );
    } else if (action === 'refill_tank') {
      const tank = body.tank; // 'bk' | 'c' | 'm' | 'y'
      if (tank === 'bk') {
        await executeD1(
          `UPDATE printer_supplies 
           SET bk_pct = 100.0, bk_pages_remaining = 4500, black_pages_remaining = 4500, last_black_refill = datetime('now'), updated_at = datetime('now')
           WHERE id = 1`
        );
      } else if (tank === 'c') {
        await executeD1(
          `UPDATE printer_supplies 
           SET c_pct = 100.0, c_pages_remaining = 7500, last_color_refill = datetime('now'), updated_at = datetime('now')
           WHERE id = 1`
        );
      } else if (tank === 'm') {
        await executeD1(
          `UPDATE printer_supplies 
           SET m_pct = 100.0, m_pages_remaining = 7500, last_color_refill = datetime('now'), updated_at = datetime('now')
           WHERE id = 1`
        );
      } else if (tank === 'y') {
        await executeD1(
          `UPDATE printer_supplies 
           SET y_pct = 100.0, y_pages_remaining = 7500, last_color_refill = datetime('now'), updated_at = datetime('now')
           WHERE id = 1`
        );
      }
    } else if (action === 'calibrate_tanks') {
      const bkPct = Math.max(0, Math.min(100, Number(body.bkPct ?? current.bk_pct ?? 18)));
      const cPct = Math.max(0, Math.min(100, Number(body.cPct ?? current.c_pct ?? 55)));
      const mPct = Math.max(0, Math.min(100, Number(body.mPct ?? current.m_pct ?? 38)));
      const yPct = Math.max(0, Math.min(100, Number(body.yPct ?? current.y_pct ?? 18)));

      const bkPages = Math.round((bkPct / 100) * 4500);
      const cPages = Math.round((cPct / 100) * 7500);
      const mPages = Math.round((mPct / 100) * 7500);
      const yPages = Math.round((yPct / 100) * 7500);
      const minColorPages = Math.min(cPages, mPages, yPages);

      await executeD1(
        `UPDATE printer_supplies 
         SET bk_pct = ?, c_pct = ?, m_pct = ?, y_pct = ?,
             bk_pages_remaining = ?, c_pages_remaining = ?, m_pages_remaining = ?, y_pages_remaining = ?,
             black_pages_remaining = ?, color_pages_remaining = ?,
             updated_at = datetime('now')
         WHERE id = 1`,
        [bkPct, cPct, mPct, yPct, bkPages, cPages, mPages, yPages, bkPages, minColorPages]
      );
    } else if (action === 'calibrate_baseline') {
      const { totalPages, colorPages, bwPages, serial, firmware, firstPrinted } = body;
      await executeD1(
        `UPDATE printer_supplies 
         SET hardware_total_pages = COALESCE(?, hardware_total_pages),
             hardware_color_pages = COALESCE(?, hardware_color_pages),
             hardware_bw_pages = COALESCE(?, hardware_bw_pages),
             hardware_serial = COALESCE(?, hardware_serial),
             hardware_firmware = COALESCE(?, hardware_firmware),
             hardware_first_printed = COALESCE(?, hardware_first_printed),
             hardware_synced_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = 1`,
        [totalPages || null, colorPages || null, bwPages || null, serial || null, firmware || null, firstPrinted || null]
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
