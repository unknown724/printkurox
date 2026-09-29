import crypto from 'crypto';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import { normalizeStationId } from '@/lib/stations';

export interface StationSettlementRecord {
  id: string;
  station_id: string;
  gross_amount: number;
  commission_amount: number;
  payout_amount: number;
  total_jobs: number;
  total_pages: number;
  period_start: string;
  period_end: string;
  settled_at: string;
  payment_ref?: string | null;
  notes?: string | null;
  created_by?: string;
}

export interface SettlementSummary {
  stationId: string;
  stationName: string;
  upiId: string | null;
  monthlyFreeQuota: number;
  freeQuotaUsedThisMonth: number;
  unsettled: {
    grossRevenue: number;
    commissionPercent: number; // 10%
    platformFee: number;       // 10%
    netPayoutOwed: number;     // 90%
    jobsCount: number;
    pagesCount: number;
    oldestJobDate: string | null;
    newestJobDate: string | null;
  };
  today: {
    grossRevenue: number;
    netPayout: number;
    pagesCount: number;
    jobsCount: number;
  };
  settled: {
    totalPaidLifetime: number;
    settlementsCount: number;
  };
  history: StationSettlementRecord[];
}

/**
 * Builds station matching SQL clause to handle legacy & normalized station IDs
 */
function getStationMatchClause(stationId: string): { clause: string; params: string[] } {
  const norm = normalizeStationId(stationId);
  if (norm === 'block_b') {
    return {
      clause: `(station_id = 'block_b' OR station_id = 'main' OR station_id = 'hostel_block_b_pare' OR station_id = 'pare' OR station_id IS NULL)`,
      params: []
    };
  }
  return {
    clause: `(station_id = ? OR station_id = ? OR station_id = ?)`,
    params: [stationId, norm, `hostel_${norm}`]
  };
}

/**
 * Calculates current settlement balance, pending payout, quota usage, and settlement history
 */
export async function getStationSettlementSummary(stationId: string): Promise<SettlementSummary> {
  const normId = normalizeStationId(stationId);
  const match = getStationMatchClause(stationId);

  // 1. Fetch station details from stations table
  let stationName = 'Print Station';
  let upiId: string | null = null;
  let monthlyFreeQuota = 50;

  try {
    const stationRows = await queryD1<{ name: string; upi_id?: string; monthly_free_quota?: number }>(
      `SELECT name, upi_id, monthly_free_quota FROM stations WHERE id = ? OR id = ? LIMIT 1`,
      [stationId, normId]
    );
    if (stationRows.length > 0) {
      stationName = stationRows[0].name || stationName;
      upiId = stationRows[0].upi_id || null;
      if (typeof stationRows[0].monthly_free_quota === 'number') {
        monthlyFreeQuota = stationRows[0].monthly_free_quota;
      }
    }
  } catch (err) {
    console.warn('Could not query stations table for metadata:', err);
  }

  // 2. Fetch completed UNSETTLED jobs with total_price > 0
  const unsettledJobs = await queryD1<{
    id: string;
    total_price: number;
    total_pages: number;
    copies: number;
    created_at: string;
  }>(
    `SELECT id, total_price, total_pages, copies, created_at 
     FROM print_jobs 
     WHERE ${match.clause} 
       AND status = 'COMPLETED' 
       AND total_price > 0 
       AND (settlement_id IS NULL OR settlement_id = '')
     ORDER BY created_at ASC`,
    match.params
  );

  let unsettledGross = 0;
  let unsettledPages = 0;
  let todayGross = 0;
  let todayPages = 0;
  let todayJobsCount = 0;

  const todayStr = new Date().toISOString().split('T')[0];

  for (const job of unsettledJobs) {
    const price = Number(job.total_price) || 0;
    const pages = (Number(job.total_pages) || 1) * (Number(job.copies) || 1);
    unsettledGross += price;
    unsettledPages += pages;

    if (job.created_at && (job.created_at.startsWith(todayStr) || job.created_at.split(' ')[0] === todayStr)) {
      todayGross += price;
      todayPages += pages;
      todayJobsCount++;
    }
  }

  const commissionPercent = 10; // Exactly 10% platform fee
  const platformFee = Math.round(unsettledGross * 0.10 * 100) / 100;
  const netPayoutOwed = Math.round((unsettledGross - platformFee) * 100) / 100;

  const todayFee = Math.round(todayGross * 0.10 * 100) / 100;
  const todayNet = Math.round((todayGross - todayFee) * 100) / 100;

  // 3. Fetch past settlements from station_settlements
  let pastSettlements: StationSettlementRecord[] = [];
  let totalPaidLifetime = 0;

  try {
    pastSettlements = await queryD1<StationSettlementRecord>(
      `SELECT id, station_id, gross_amount, commission_amount, payout_amount, 
              total_jobs, total_pages, period_start, period_end, settled_at, payment_ref, notes, created_by 
       FROM station_settlements 
       WHERE station_id = ? OR station_id = ?
       ORDER BY settled_at DESC LIMIT 50`,
      [stationId, normId]
    );

    for (const s of pastSettlements) {
      totalPaidLifetime += Number(s.payout_amount) || 0;
    }
    totalPaidLifetime = Math.round(totalPaidLifetime * 100) / 100;
  } catch (err) {
    console.warn('Could not query station_settlements table:', err);
  }

  // 4. Fetch current month's owner free prints usage
  let freeQuotaUsedThisMonth = 0;
  try {
    const currentYearMonth = todayStr.substring(0, 7); // e.g. "2026-09"
    const freeRows = await queryD1<{ total_pages: number; copies: number }>(
      `SELECT total_pages, copies 
       FROM print_jobs 
       WHERE ${match.clause} 
         AND payment_id LIKE 'OWNER_FREE_PRINT_%'
         AND created_at LIKE ?`,
      [...match.params, `${currentYearMonth}%`]
    );

    for (const f of freeRows) {
      freeQuotaUsedThisMonth += (Number(f.total_pages) || 1) * (Number(f.copies) || 1);
    }
  } catch (err) {
    console.warn('Could not query free quota prints:', err);
  }

  return {
    stationId,
    stationName,
    upiId,
    monthlyFreeQuota,
    freeQuotaUsedThisMonth,
    unsettled: {
      grossRevenue: unsettledGross,
      commissionPercent,
      platformFee,
      netPayoutOwed,
      jobsCount: unsettledJobs.length,
      pagesCount: unsettledPages,
      oldestJobDate: unsettledJobs.length > 0 ? unsettledJobs[0].created_at : null,
      newestJobDate: unsettledJobs.length > 0 ? unsettledJobs[unsettledJobs.length - 1].created_at : null,
    },
    today: {
      grossRevenue: todayGross,
      netPayout: todayNet,
      pagesCount: todayPages,
      jobsCount: todayJobsCount,
    },
    settled: {
      totalPaidLifetime,
      settlementsCount: pastSettlements.length,
    },
    history: pastSettlements,
  };
}

/**
 * Creates a settlement record and tags all unsettled jobs with settlement_id
 * to permanently clear pending balance and eliminate double-counting.
 */
export async function settleStationBalance(params: {
  stationId: string;
  paymentRef?: string;
  notes?: string;
  createdBy?: string;
}): Promise<{
  success: boolean;
  settlement?: StationSettlementRecord;
  error?: string;
}> {
  const { stationId, paymentRef = '', notes = '', createdBy = 'ADMIN' } = params;
  const match = getStationMatchClause(stationId);
  const normId = normalizeStationId(stationId);

  // 1. Fetch current unsettled jobs
  const unsettledJobs = await queryD1<{
    id: string;
    total_price: number;
    total_pages: number;
    copies: number;
    created_at: string;
  }>(
    `SELECT id, total_price, total_pages, copies, created_at 
     FROM print_jobs 
     WHERE ${match.clause} 
       AND status = 'COMPLETED' 
       AND total_price > 0 
       AND (settlement_id IS NULL OR settlement_id = '')
     ORDER BY created_at ASC`,
    match.params
  );

  if (unsettledJobs.length === 0) {
    return { success: false, error: 'No unsettled balance to pay out for this station.' };
  }

  let grossAmount = 0;
  let totalPages = 0;
  for (const job of unsettledJobs) {
    grossAmount += Number(job.total_price) || 0;
    totalPages += (Number(job.total_pages) || 1) * (Number(job.copies) || 1);
  }

  const commissionAmount = Math.round(grossAmount * 0.10 * 100) / 100;
  const payoutAmount = Math.round((grossAmount - commissionAmount) * 100) / 100;
  const settlementId = `stl_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const periodStart = unsettledJobs[0].created_at || now;
  const periodEnd = unsettledJobs[unsettledJobs.length - 1].created_at || now;

  // 2. Insert into station_settlements
  await executeD1(
    `INSERT INTO station_settlements (
      id, station_id, gross_amount, commission_amount, payout_amount,
      total_jobs, total_pages, period_start, period_end, settled_at,
      payment_ref, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      settlementId,
      normId,
      grossAmount,
      commissionAmount,
      payoutAmount,
      unsettledJobs.length,
      totalPages,
      periodStart,
      periodEnd,
      now,
      paymentRef || null,
      notes || null,
      createdBy || 'ADMIN',
    ]
  );

  // 3. Mark all unsettled jobs with this settlementId (batch in chunks if needed)
  const jobIds = unsettledJobs.map((j) => j.id);
  const chunkSize = 40;
  for (let i = 0; i < jobIds.length; i += chunkSize) {
    const chunk = jobIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    await executeD1(
      `UPDATE print_jobs SET settlement_id = ? WHERE id IN (${placeholders})`,
      [settlementId, ...chunk]
    );
  }

  const settlement: StationSettlementRecord = {
    id: settlementId,
    station_id: normId,
    gross_amount: grossAmount,
    commission_amount: commissionAmount,
    payout_amount: payoutAmount,
    total_jobs: unsettledJobs.length,
    total_pages: totalPages,
    period_start: periodStart,
    period_end: periodEnd,
    settled_at: now,
    payment_ref: paymentRef,
    notes: notes,
    created_by: createdBy,
  };

  return { success: true, settlement };
}

/**
 * Checks if station owner has free print quota remaining this month
 */
export async function checkOwnerFreeQuota(
  stationId: string,
  requestedPages: number
): Promise<{
  allowed: boolean;
  used: number;
  quota: number;
  remaining: number;
  error?: string;
}> {
  const normId = normalizeStationId(stationId);
  const match = getStationMatchClause(stationId);
  const todayStr = new Date().toISOString().split('T')[0];
  const currentYearMonth = todayStr.substring(0, 7);

  let monthlyQuota = 50;
  try {
    const stationRows = await queryD1<{ monthly_free_quota?: number }>(
      `SELECT monthly_free_quota FROM stations WHERE id = ? OR id = ? LIMIT 1`,
      [stationId, normId]
    );
    if (stationRows.length > 0 && typeof stationRows[0].monthly_free_quota === 'number') {
      monthlyQuota = stationRows[0].monthly_free_quota;
    }
  } catch {}

  let usedPages = 0;
  try {
    const rows = await queryD1<{ total_pages: number; copies: number }>(
      `SELECT total_pages, copies 
       FROM print_jobs 
       WHERE ${match.clause} 
         AND payment_id LIKE 'OWNER_FREE_PRINT_%'
         AND created_at LIKE ?`,
      [...match.params, `${currentYearMonth}%`]
    );
    for (const r of rows) {
      usedPages += (Number(r.total_pages) || 1) * (Number(r.copies) || 1);
    }
  } catch {}

  const remaining = Math.max(0, monthlyQuota - usedPages);
  if (requestedPages > remaining) {
    return {
      allowed: false,
      used: usedPages,
      quota: monthlyQuota,
      remaining,
      error: `Monthly free quota exceeded. You have used ${usedPages}/${monthlyQuota} free pages this month (Remaining: ${remaining} pages). Contact platform admin to increase quota or use standard print payment.`
    };
  }

  return {
    allowed: true,
    used: usedPages,
    quota: monthlyQuota,
    remaining: remaining - requestedPages,
  };
}

/**
 * Updates UPI ID for a station so weekly Sunday settlements go to the right address
 */
export async function updateStationUpi(stationId: string, upiId: string): Promise<boolean> {
  const normId = normalizeStationId(stationId);
  await executeD1(
    `UPDATE stations SET upi_id = ? WHERE id = ? OR id = ?`,
    [upiId.trim(), stationId, normId]
  );
  return true;
}
