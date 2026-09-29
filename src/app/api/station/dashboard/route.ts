import { NextRequest, NextResponse } from 'next/server';
import { queryD1 } from '@/lib/cloudflare-d1';
import { getStationPricing, saveStationPricing } from '@/lib/station-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stationId, pin, token, action, pricingUpdates } = body;

    if (!stationId || (!pin && !token)) {
      return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }

    // 1. Verify Station and Credentials (supports both secret station_token and admin password)
    const { normalizeStationId, getStationConfig } = await import('@/lib/stations');
    const norm = normalizeStationId(stationId);
    const stationConfig = getStationConfig(stationId);

    const stationRows = await queryD1<{ 
      id: string; 
      name: string; 
      admin_pin: string; 
      station_token: string; 
      station_type: string;
      status: string;
      last_heartbeat: string;
    }>(
      `SELECT id, name, admin_pin, station_token, station_type, status, last_heartbeat 
       FROM stations 
       WHERE id = ? OR id = ? OR id = ? OR id = ? LIMIT 1`,
      [stationId, norm, `hostel_${norm}`, `hostel_${norm}_pare`]
    );

    let station = stationRows[0];
    if (!station) {
      if (stationConfig) {
        station = {
          id: stationConfig.id,
          name: stationConfig.name,
          admin_pin: stationConfig.adminPin,
          station_token: '',
          station_type: 'hostel',
          status: 'offline',
          last_heartbeat: '',
        };
      } else {
        return NextResponse.json({ success: false, error: 'Station not found' }, { status: 404 });
      }
    }

    // Cryptographic Token Match (Magic Link / Saved Device) OR Password Match
    const isTokenValid = Boolean(token && station.station_token && station.station_token === token);
    const isPasswordValid = Boolean(
      pin && (
        station.admin_pin === pin || 
        (stationConfig && stationConfig.adminPin === pin) ||
        (process.env.ADMIN_SECRET_KEY && pin === process.env.ADMIN_SECRET_KEY)
      )
    );

    if (!isTokenValid && !isPasswordValid) {
      return NextResponse.json({ success: false, error: 'Invalid password or access token' }, { status: 401 });
    }

    // Handle Price Update Action from Owner
    if (action === 'UPDATE_PRICING' && pricingUpdates) {
      const saveRes = await saveStationPricing(stationId, pricingUpdates);
      if (!saveRes.success) {
        return NextResponse.json({ success: false, error: saveRes.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        message: 'Station pricing updated successfully',
        pricing: saveRes.config,
      });
    }

    // 2. Fetch Settlement & Quota Summary
    const { getStationSettlementSummary } = await import('@/lib/settlement-service');
    const settlementSummary = await getStationSettlementSummary(stationId);

    // 3. Fetch Recent Jobs for this station
    const matchClause = norm === 'block_b'
      ? `(station_id = 'block_b' OR station_id = 'main' OR station_id = 'hostel_block_b_pare' OR station_id = 'pare' OR station_id IS NULL)`
      : `(station_id = '${stationId}' OR station_id = '${norm}' OR station_id = 'hostel_${norm}')`;

    const jobs = await queryD1<{ 
      id: string; 
      status: string; 
      total_price: number; 
      total_pages: number;
      copies: number;
      created_at: string;
      settlement_id?: string | null;
      payment_id?: string | null;
    }>(
      `SELECT id, status, total_price, total_pages, copies, created_at, settlement_id, payment_id 
       FROM print_jobs 
       WHERE ${matchClause} AND status = 'COMPLETED'
       ORDER BY created_at DESC 
       LIMIT 30`
    );

    let allTimePages = 0;
    try {
      const pageSumRow = await queryD1<{ total_pages_sum: number }>(
        `SELECT SUM(total_pages * copies) as total_pages_sum FROM print_jobs WHERE ${matchClause} AND status = 'COMPLETED'`
      );
      allTimePages = pageSumRow[0]?.total_pages_sum || 0;
    } catch {}

    // Fetch current dynamic pricing for this station
    const pricing = await getStationPricing(stationId);

    return NextResponse.json({
      success: true,
      stationName: station.name,
      stationType: station.station_type,
      stationToken: station.station_token,
      upiId: settlementSummary.upiId,
      monthlyFreeQuota: settlementSummary.monthlyFreeQuota,
      freeQuotaUsedThisMonth: settlementSummary.freeQuotaUsedThisMonth,
      freeQuotaRemaining: Math.max(0, settlementSummary.monthlyFreeQuota - settlementSummary.freeQuotaUsedThisMonth),
      deviceStatus: {
        status: station.status || 'offline',
        lastHeartbeat: station.last_heartbeat || null,
      },
      pricing: {
        bwSingle: pricing.bwSingle,
        colorSingle: pricing.colorSingle,
        bwBulk: pricing.bwBulk,
        colorBulk: pricing.colorBulk,
      },
      metrics: {
        // Pending Payout (To be paid this Sunday, 90% after 10% fee)
        totalEarned: settlementSummary.unsettled.netPayoutOwed,
        unsettledGross: settlementSummary.unsettled.grossRevenue,
        platformFee: settlementSummary.unsettled.platformFee,
        // Today's earnings (90%)
        todayEarned: settlementSummary.today.netPayout,
        todayGross: settlementSummary.today.grossRevenue,
        // Lifetime money paid to owner
        totalSettled: settlementSummary.settled.totalPaidLifetime,
        settlementsCount: settlementSummary.settled.settlementsCount,
        // Pages
        totalPages: allTimePages || settlementSummary.unsettled.pagesCount,
        todayPages: settlementSummary.today.pagesCount,
      },
      settlementHistory: settlementSummary.history,
      recentJobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        total_price: j.total_price,
        total_pages: (j.total_pages || 1) * (j.copies || 1),
        created_at: j.created_at,
        isSettled: Boolean(j.settlement_id),
        isFreePrint: Boolean(j.payment_id && (j.payment_id.startsWith('OWNER_FREE_') || j.payment_id.startsWith('ADMIN_BYPASS_'))),
      })),
    });

  } catch (err) {
    console.error('Owner Dashboard API Error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

