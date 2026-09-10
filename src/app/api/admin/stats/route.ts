import { NextRequest, NextResponse } from 'next/server';
import { queryD1, PrinterSuppliesRecord, PrinterTelemetryRecord } from '@/lib/cloudflare-d1';
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MetricRow {
  total_jobs: number;
  total_pages: number;
  bw_pages: number;
  color_pages: number;
  total_sheets: number;
  duplex_sheets: number;
  single_sheets: number;
  gross_revenue: number;
}

interface PeriodBreakdownRow {
  period: string;
  jobs: number;
  total_pages: number;
  bw_pages: number;
  color_pages: number;
  sheets: number;
  revenue: number;
}

interface HourlyBreakdownRow {
  hour: string;
  jobs: number;
  pages: number;
}

// Consumables cost baselines (INR)
const COST_PER_BW_PAGE = 0.15; // Ink wear & tear per B&W page
const COST_PER_COLOR_PAGE = 0.35; // Ink wear & tear per Color page
const COST_PER_SHEET = 0.65; // High-grade 75 GSM A4 paper sheet

function computeProfit(grossRevenue: number, bwPages: number, colorPages: number, sheets: number) {
  const consumableCost = (bwPages * COST_PER_BW_PAGE) + (colorPages * COST_PER_COLOR_PAGE) + (sheets * COST_PER_SHEET);
  const profit = Math.max(0, grossRevenue - consumableCost);
  return {
    consumableCost: Math.round(consumableCost * 100) / 100,
    netProfit: Math.round(profit * 100) / 100,
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'all'; // all, today, week, month, year
    const targetMonth = searchParams.get('month'); // e.g. "2026-09"

    // 1. Fetch live supplies & telemetry
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

    // Calculate percentage remaining for visual gauges
    const blackPercent = Math.min(100, Math.max(0, Math.round((supplies.black_pages_remaining / (supplies.black_capacity || 4500)) * 100)));
    const colorPercent = Math.min(100, Math.max(0, Math.round((supplies.color_pages_remaining / (supplies.color_capacity || 7500)) * 100)));
    const paperPercent = Math.min(100, Math.max(0, Math.round((supplies.paper_sheets_remaining / (supplies.paper_capacity || 500)) * 100)));

    // 2. All-Time Aggregations
    const allTimeSql = `
      SELECT 
        COUNT(*) as total_jobs,
        COALESCE(SUM(total_pages * copies), 0) as total_pages,
        COALESCE(SUM(CASE WHEN color_mode = 'bw' THEN total_pages * copies ELSE 0 END), 0) as bw_pages,
        COALESCE(SUM(CASE WHEN color_mode = 'color' THEN total_pages * copies ELSE 0 END), 0) as color_pages,
        COALESCE(SUM((duplex_sheets + single_sheets) * copies), 0) as total_sheets,
        COALESCE(SUM(duplex_sheets * copies), 0) as duplex_sheets,
        COALESCE(SUM(single_sheets * copies), 0) as single_sheets,
        COALESCE(SUM(CASE WHEN payment_id NOT LIKE 'ADMIN_%' OR payment_id IS NULL THEN total_price ELSE 0 END), 0) as gross_revenue
      FROM print_jobs
      WHERE status IN ('COMPLETED', 'PAID')
    `;
    const allTimeRows = await queryD1<MetricRow>(allTimeSql);
    const allTime = allTimeRows[0] || {
      total_jobs: 0,
      total_pages: 0,
      bw_pages: 0,
      color_pages: 0,
      total_sheets: 0,
      duplex_sheets: 0,
      single_sheets: 0,
      gross_revenue: 0,
    };
    const allTimeFinance = computeProfit(allTime.gross_revenue, allTime.bw_pages, allTime.color_pages, allTime.total_sheets);

    // 3. Filtered Period Metrics
    let periodWhere = "WHERE status IN ('COMPLETED', 'PAID')";
    const periodParams: (string | number)[] = [];

    if (period === 'today') {
      periodWhere += " AND created_at >= datetime('now', 'start of day')";
    } else if (period === 'week') {
      periodWhere += " AND created_at >= datetime('now', '-7 days')";
    } else if (period === 'month') {
      periodWhere += " AND created_at >= datetime('now', 'start of month')";
    } else if (period === 'year') {
      periodWhere += " AND created_at >= datetime('now', 'start of year')";
    } else if (targetMonth) {
      periodWhere += " AND strftime('%Y-%m', created_at) = ?";
      periodParams.push(targetMonth);
    }

    const periodSql = `
      SELECT 
        COUNT(*) as total_jobs,
        COALESCE(SUM(total_pages * copies), 0) as total_pages,
        COALESCE(SUM(CASE WHEN color_mode = 'bw' THEN total_pages * copies ELSE 0 END), 0) as bw_pages,
        COALESCE(SUM(CASE WHEN color_mode = 'color' THEN total_pages * copies ELSE 0 END), 0) as color_pages,
        COALESCE(SUM((duplex_sheets + single_sheets) * copies), 0) as total_sheets,
        COALESCE(SUM(duplex_sheets * copies), 0) as duplex_sheets,
        COALESCE(SUM(single_sheets * copies), 0) as single_sheets,
        COALESCE(SUM(CASE WHEN payment_id NOT LIKE 'ADMIN_%' OR payment_id IS NULL THEN total_price ELSE 0 END), 0) as gross_revenue
      FROM print_jobs
      ${periodWhere}
    `;
    const periodRows = await queryD1<MetricRow>(periodSql, periodParams);
    const periodData = periodRows[0] || {
      total_jobs: 0,
      total_pages: 0,
      bw_pages: 0,
      color_pages: 0,
      total_sheets: 0,
      duplex_sheets: 0,
      single_sheets: 0,
      gross_revenue: 0,
    };
    const periodFinance = computeProfit(periodData.gross_revenue, periodData.bw_pages, periodData.color_pages, periodData.total_sheets);

    // 4. Monthly Historical Breakdown (Months of Current Year & All-time)
    const monthlySql = `
      SELECT 
        strftime('%Y-%m', created_at) as period,
        COUNT(*) as jobs,
        COALESCE(SUM(total_pages * copies), 0) as total_pages,
        COALESCE(SUM(CASE WHEN color_mode = 'bw' THEN total_pages * copies ELSE 0 END), 0) as bw_pages,
        COALESCE(SUM(CASE WHEN color_mode = 'color' THEN total_pages * copies ELSE 0 END), 0) as color_pages,
        COALESCE(SUM((duplex_sheets + single_sheets) * copies), 0) as sheets,
        COALESCE(SUM(CASE WHEN payment_id NOT LIKE 'ADMIN_%' OR payment_id IS NULL THEN total_price ELSE 0 END), 0) as revenue
      FROM print_jobs
      WHERE status IN ('COMPLETED', 'PAID')
      GROUP BY period
      ORDER BY period DESC
      LIMIT 12
    `;
    const monthlyRows = await queryD1<PeriodBreakdownRow>(monthlySql);

    // 5. Daily Breakdown (for Current or Selected Month)
    const activeMonth = targetMonth || new Date().toISOString().slice(0, 7);
    const dailySql = `
      SELECT 
        strftime('%Y-%m-%d', created_at) as period,
        COUNT(*) as jobs,
        COALESCE(SUM(total_pages * copies), 0) as total_pages,
        COALESCE(SUM(CASE WHEN color_mode = 'bw' THEN total_pages * copies ELSE 0 END), 0) as bw_pages,
        COALESCE(SUM(CASE WHEN color_mode = 'color' THEN total_pages * copies ELSE 0 END), 0) as color_pages,
        COALESCE(SUM((duplex_sheets + single_sheets) * copies), 0) as sheets,
        COALESCE(SUM(CASE WHEN payment_id NOT LIKE 'ADMIN_%' OR payment_id IS NULL THEN total_price ELSE 0 END), 0) as revenue
      FROM print_jobs
      WHERE status IN ('COMPLETED', 'PAID')
        AND strftime('%Y-%m', created_at) = ?
      GROUP BY period
      ORDER BY period DESC
      LIMIT 31
    `;
    const dailyRows = await queryD1<PeriodBreakdownRow>(dailySql, [activeMonth]);

    // 6. Hourly Distribution (Peak Printing Hours 00 to 23)
    const hourlySql = `
      SELECT 
        strftime('%H', created_at) as hour,
        COUNT(*) as jobs,
        COALESCE(SUM(total_pages * copies), 0) as pages
      FROM print_jobs
      WHERE status IN ('COMPLETED', 'PAID')
      GROUP BY hour
      ORDER BY hour ASC
    `;
    const hourlyRows = await queryD1<HourlyBreakdownRow>(hourlySql);

    // Hardware Lifetime Totals (EEPROM baseline + online kiosk jobs)
    const hwBaselineTotal = Number(supplies.hardware_total_pages ?? 24741);
    const hwBaselineBw = Number(supplies.hardware_bw_pages ?? 13845);
    const hwBaselineColor = Number(supplies.hardware_color_pages ?? 10828);

    const lifetimeMachine = {
      total_pages: hwBaselineTotal + Number(allTime.total_pages),
      bw_pages: hwBaselineBw + Number(allTime.bw_pages),
      color_pages: hwBaselineColor + Number(allTime.color_pages),
      hardware_baseline_total: hwBaselineTotal,
      hardware_baseline_bw: hwBaselineBw,
      hardware_baseline_color: hwBaselineColor,
      serial: supplies.hardware_serial || 'X8HY012040',
      firmware: supplies.hardware_firmware || 'XH19P5',
      first_printed: supplies.hardware_first_printed || '2022/12/13',
      synced_at: supplies.hardware_synced_at || new Date().toISOString(),
      model: supplies.printer_model || 'Epson EcoTank L3212',
    };

    return NextResponse.json({
      success: true,
      supplies: {
        ...supplies,
        blackPercent,
        colorPercent,
        paperPercent,
      },
      telemetry,
      lifetimeMachine,
      allTime: {
        ...allTime,
        ...allTimeFinance,
      },
      period: {
        selected: period,
        ...periodData,
        ...periodFinance,
      },
      history: {
        monthly: monthlyRows,
        daily: dailyRows,
        hourly: hourlyRows,
      },
    });
  } catch (err: unknown) {
    console.error('Error in /api/admin/stats:', err);
    return NextResponse.json({ error: 'Failed to compute admin statistics' }, { status: 500 });
  }
}
