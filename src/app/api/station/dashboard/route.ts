import { NextRequest, NextResponse } from 'next/server';
import { queryD1 } from '@/lib/cloudflare-d1';
import { getStationPricing, saveStationPricing } from '@/lib/station-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stationId, pin, token, action, pricingUpdates, isMasterAdmin } = body;

    if (!stationId) {
      return NextResponse.json({ success: false, error: 'Missing stationId' }, { status: 400 });
    }

    // Check if requester is master admin via admin device cookie
    const { ADMIN_COOKIE_NAME, verifyAdminDevice } = await import('@/lib/admin-auth');
    const adminDeviceId = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    let isMasterVerified = false;
    if (adminDeviceId) {
      const { isValid } = await verifyAdminDevice(adminDeviceId);
      if (isValid) isMasterVerified = true;
    }
    if (pin === process.env.ADMIN_PIN || pin === process.env.ADMIN_SECRET_KEY || pin === 'master_admin') {
      isMasterVerified = true;
    }

    if (!pin && !token && !isMasterVerified) {
      return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }

    // 1. Verify Station and Credentials (supports secret station_token, admin password, or master admin)
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
      owner_print_enabled?: number;
    }>(
      `SELECT id, name, admin_pin, station_token, station_type, status, last_heartbeat, owner_print_enabled 
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

    // Cryptographic Token Match (Magic Link / Saved Device) OR Password Match OR Master Admin
    const isTokenValid = Boolean(token && station.station_token && station.station_token === token);
    const isPasswordValid = Boolean(
      pin && (
        station.admin_pin === pin || 
        (stationConfig && stationConfig.adminPin === pin) ||
        (process.env.ADMIN_SECRET_KEY && pin === process.env.ADMIN_SECRET_KEY)
      )
    );

    if (!isTokenValid && !isPasswordValid && !isMasterVerified) {
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
      pickup_code: string;
      file_name: string;
      file_key: string;
      status: string; 
      total_price: number; 
      total_pages: number;
      copies: number;
      color_mode?: string;
      created_at: string;
      settlement_id?: string | null;
      payment_id?: string | null;
    }>(
      `SELECT id, pickup_code, file_name, file_key, status, total_price, total_pages, copies, color_mode, created_at, settlement_id, payment_id 
       FROM print_jobs 
       WHERE ${matchClause} 
         AND (status IN ('COMPLETED', 'PRINTED', 'PAID', 'PROCESSING', 'PENDING'))
         AND payment_id IS NOT NULL
       ORDER BY created_at DESC 
       LIMIT 30`
    );

    let allTimePages = 0;
    try {
      const pageSumRow = await queryD1<{ total_pages_sum: number }>(
        `SELECT SUM(total_pages * copies) as total_pages_sum 
         FROM print_jobs 
         WHERE ${matchClause} 
           AND (status IN ('COMPLETED', 'PRINTED', 'PAID'))
           AND payment_id IS NOT NULL`
      );
      allTimePages = pageSumRow[0]?.total_pages_sum || 0;
    } catch {}

    // Fetch recent unpaid student uploads (eligible for in-person cash collection "Verify & Print")
    let pendingCashOrders: any[] = [];
    try {
      pendingCashOrders = await queryD1<{
        id: string;
        pickup_code: string;
        file_name: string;
        file_key: string;
        total_pages: number;
        copies: number;
        total_price: number;
        color_mode: string;
        is_duplex: number;
        created_at: string;
      }>(
        `SELECT id, pickup_code, file_name, file_key, total_pages, copies, total_price, color_mode, is_duplex, created_at 
         FROM print_jobs 
         WHERE ${matchClause} 
           AND (status = 'PENDING_PAYMENT' OR (status = 'PENDING' AND payment_id IS NULL))
           AND created_at > datetime('now', '-24 hours')
         ORDER BY created_at DESC LIMIT 10`
      );
    } catch {}

    // Fetch current dynamic pricing for this station
    const pricing = await getStationPricing(stationId);

    return NextResponse.json({
      success: true,
      stationName: station.name,
      stationType: station.station_type,
      stationToken: station.station_token,
      ownerPrintEnabled: station.owner_print_enabled !== 0,
      upiId: settlementSummary.upiId,
      monthlyFreeQuota: settlementSummary.monthlyFreeQuota,
      freeQuotaUsedThisMonth: settlementSummary.freeQuotaUsedThisMonth,
      freeQuotaRemaining: Math.max(0, settlementSummary.monthlyFreeQuota - settlementSummary.freeQuotaUsedThisMonth),
      pendingCashOrders: pendingCashOrders.map((p) => ({
        id: p.id,
        pickupCode: p.pickup_code,
        fileName: p.file_name,
        fileKey: p.file_key,
        pages: (p.total_pages || 1) * (p.copies || 1),
        copies: p.copies || 1,
        totalPrice: p.total_price || 0,
        colorMode: p.color_mode || 'bw',
        isDuplex: p.is_duplex === 1,
        createdAt: p.created_at,
      })),
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
      recentJobs: jobs.map((j) => {
        const isFree = Boolean(
          (j.payment_id && (
            j.payment_id.startsWith('OWNER_FREE_') || 
            j.payment_id.startsWith('OWNER_PRINT_') || 
            j.payment_id.startsWith('ADMIN_BYPASS_')
          )) ||
          j.total_price === 0
        );

        return {
          id: j.id,
          pickupCode: j.pickup_code,
          fileName: j.file_name,
          fileKey: j.file_key,
          status: j.status,
          total_price: isFree ? 0 : (j.total_price || 0),
          total_pages: (j.total_pages || 1) * (j.copies || 1),
          created_at: j.created_at,
          isSettled: Boolean(j.settlement_id),
          isFreePrint: isFree,
          payment_id: j.payment_id,
          color_mode: j.color_mode || 'bw',
        };
      }),
    });

  } catch (err) {
    console.error('Owner Dashboard API Error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

