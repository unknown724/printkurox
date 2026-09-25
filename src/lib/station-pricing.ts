/**
 * Station Pricing Management & Guardrails Engine
 * Persists custom rates per hostel in Cloudflare D1 app_settings table.
 * Provides fail-safe fallbacks, in-memory caching, and price guardrails.
 */

import { queryD1, executeD1 } from '@/lib/cloudflare-d1';
import { TIER_RATES } from '@/lib/pricing';
import { STATIONS } from '@/lib/stations';

export interface StationPricingConfig {
  stationId: string;
  bwSingle: number;       // Default: 4.0
  colorSingle: number;    // Default: 7.0
  bwBulk: number;         // Default: 3.0 (for 10+ sheets bulk)
  colorBulk: number;      // Default: 5.0 (for 10+ sheets bulk)
  bwMega?: number;        // Default: 3.0 (floor ₹3.00, no rate lower)
  colorMega?: number;     // Default: 5.0 (floor ₹5.00, no rate lower)
  bwDuplex?: number;      // Optional fallback
  colorDuplex?: number;   // Optional fallback
  assignmentDiscountPct?: number; // Default: 25 (%) for 10+ sheets
  megaDiscountPct?: number;       // Default: 25 (%) (floor at bulk rate)
  razorpayAccountId?: string;    // e.g. 'acc_xxxxxxxxxxxxxx'
  commissionPercent: number;     // Default: 10 (%) platform commission
  updatedAt?: string;
}

export interface StationPricingTierRates {
  standard: {
    bw: { single: number; duplex: number };
    color: { single: number; duplex: number };
  };
  assignment: {
    bw: { single: number; duplex: number };
    color: { single: number; duplex: number };
  };
  mega: {
    bw: { single: number; duplex: number };
    color: { single: number; duplex: number };
  };
}

export const PRICING_GUARDRAILS = {
  bwSingle: { min: 2.0, max: 10.0 },       // ₹2.00 guarantees paper + toner cost
  colorSingle: { min: 4.0, max: 20.0 },    // ₹4.00 guarantees paper + 3-color ink
  bwBulk: { min: 3.0, max: 8.0 },          // Bulk B&W discount rate (10+ sheets, floor ₹3.00)
  colorBulk: { min: 5.0, max: 15.0 },      // Bulk Color discount rate (10+ sheets, floor ₹5.00)
  bwMega: { min: 3.0, max: 8.0 },          // Floor ₹3.00, no discount below ₹3
  colorMega: { min: 5.0, max: 15.0 },      // Floor ₹5.00, no discount below ₹5
  bwDuplex: { min: 3.0, max: 18.0 },
  colorDuplex: { min: 6.0, max: 35.0 },
  commissionPercent: { min: 0, max: 50 },  // 0% - 50% platform fee
} as const;

// In-memory cache for ultra-fast client and order validation lookups
const pricingCache = new Map<string, { config: StationPricingConfig; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL

export function getDefaultStationPricing(stationId: string): StationPricingConfig {
  const normId = (stationId || 'block_b').toLowerCase().trim();
  const station = STATIONS[normId] || STATIONS.block_b;

  return {
    stationId: normId,
    bwSingle: TIER_RATES.standard.bw.single,       // 4.0
    colorSingle: TIER_RATES.standard.color.single, // 7.0
    bwBulk: TIER_RATES.assignment.bw.single,       // 3.0 (bulk 10+ sheets)
    colorBulk: TIER_RATES.assignment.color.single, // 5.0 (bulk 10+ sheets)
    bwMega: TIER_RATES.mega.bw.single,             // 3.0 (no offer less than 3.0)
    colorMega: TIER_RATES.mega.color.single,       // 5.0 (no offer less than 5.0)
    bwDuplex: TIER_RATES.standard.bw.duplex,       // 6.0
    colorDuplex: TIER_RATES.standard.color.duplex, // 10.0
    assignmentDiscountPct: 25,                    // 25% discount for 10+ sheets (B&W)
    megaDiscountPct: 25,                           // 25% discount (same as bulk, no rate less than 3/5)
    razorpayAccountId: station?.razorpayAccountId || '',
    commissionPercent: station?.commissionPercent ?? 10,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validates rates against platform safety guardrails.
 */
export function validatePricingGuardrails(config: Partial<StationPricingConfig>): { isValid: boolean; error?: string } {
  if (config.bwSingle !== undefined) {
    if (config.bwSingle < PRICING_GUARDRAILS.bwSingle.min || config.bwSingle > PRICING_GUARDRAILS.bwSingle.max) {
      return {
        isValid: false,
        error: `B&W Single rate must be between ₹${PRICING_GUARDRAILS.bwSingle.min.toFixed(2)} and ₹${PRICING_GUARDRAILS.bwSingle.max.toFixed(2)}`,
      };
    }
  }

  if (config.colorSingle !== undefined) {
    if (config.colorSingle < PRICING_GUARDRAILS.colorSingle.min || config.colorSingle > PRICING_GUARDRAILS.colorSingle.max) {
      return {
        isValid: false,
        error: `Color Single rate must be between ₹${PRICING_GUARDRAILS.colorSingle.min.toFixed(2)} and ₹${PRICING_GUARDRAILS.colorSingle.max.toFixed(2)}`,
      };
    }
  }

  if (config.bwBulk !== undefined) {
    if (config.bwBulk < PRICING_GUARDRAILS.bwBulk.min || config.bwBulk > PRICING_GUARDRAILS.bwBulk.max) {
      return {
        isValid: false,
        error: `B&W Bulk rate must be between ₹${PRICING_GUARDRAILS.bwBulk.min.toFixed(2)} and ₹${PRICING_GUARDRAILS.bwBulk.max.toFixed(2)}`,
      };
    }
  }

  if (config.colorBulk !== undefined) {
    if (config.colorBulk < PRICING_GUARDRAILS.colorBulk.min || config.colorBulk > PRICING_GUARDRAILS.colorBulk.max) {
      return {
        isValid: false,
        error: `Color Bulk rate must be between ₹${PRICING_GUARDRAILS.colorBulk.min.toFixed(2)} and ₹${PRICING_GUARDRAILS.colorBulk.max.toFixed(2)}`,
      };
    }
  }

  if (config.bwMega !== undefined) {
    if (config.bwMega < PRICING_GUARDRAILS.bwMega.min || config.bwMega > PRICING_GUARDRAILS.bwMega.max) {
      return {
        isValid: false,
        error: `B&W Mega Bulk (30+) rate must be between ₹${PRICING_GUARDRAILS.bwMega.min.toFixed(2)} and ₹${PRICING_GUARDRAILS.bwMega.max.toFixed(2)}`,
      };
    }
  }

  if (config.colorMega !== undefined) {
    if (config.colorMega < PRICING_GUARDRAILS.colorMega.min || config.colorMega > PRICING_GUARDRAILS.colorMega.max) {
      return {
        isValid: false,
        error: `Color Mega Bulk (30+) rate must be between ₹${PRICING_GUARDRAILS.colorMega.min.toFixed(2)} and ₹${PRICING_GUARDRAILS.colorMega.max.toFixed(2)}`,
      };
    }
  }

  if (config.commissionPercent !== undefined) {
    if (config.commissionPercent < PRICING_GUARDRAILS.commissionPercent.min || config.commissionPercent > PRICING_GUARDRAILS.commissionPercent.max) {
      return {
        isValid: false,
        error: `Commission must be between ${PRICING_GUARDRAILS.commissionPercent.min}% and ${PRICING_GUARDRAILS.commissionPercent.max}%`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Builds standard/assignment/mega tier rates from a StationPricingConfig
 */
export function buildTierRatesFromConfig(cfg: StationPricingConfig): StationPricingTierRates {
  const bwSingle = Number(cfg.bwSingle) || 4.0;
  const colorSingle = Number(cfg.colorSingle) || 7.0;

  // Bulk rate for 10+ sheets: configured bulk rate or sensible 25% discount fallback
  const bwBulk = Number(cfg.bwBulk) || (cfg.bwDuplex ? Math.min(bwSingle, Math.round((cfg.bwDuplex / 2) * 2) / 2) : Math.max(1.5, Math.round(bwSingle * 0.75 * 2) / 2));
  const colorBulk = Number(cfg.colorBulk) || (cfg.colorDuplex ? Math.min(colorSingle, Math.round((cfg.colorDuplex / 2) * 2) / 2) : Math.max(3.0, Math.round(colorSingle * 0.75 * 2) / 2));

  // Duplex fallbacks if duplex is ever toggled (1.5x single)
  const bwDuplex = Number(cfg.bwDuplex) || Math.round(bwSingle * 1.5 * 2) / 2;
  const colorDuplex = Number(cfg.colorDuplex) || Math.round(colorSingle * 1.5 * 2) / 2;
  const bwBulkDuplex = Math.round(bwBulk * 1.5 * 2) / 2;
  const colorBulkDuplex = Math.round(colorBulk * 1.5 * 2) / 2;

  // Mega bulk tier (capped so no rate is less than the 10+ bulk rate)
  const bwMegaSingle = cfg.bwMega !== undefined && Number(cfg.bwMega) > 0
    ? Math.max(bwBulk, Number(cfg.bwMega))
    : bwBulk;
  const colorMegaSingle = cfg.colorMega !== undefined && Number(cfg.colorMega) > 0
    ? Math.max(colorBulk, Number(cfg.colorMega))
    : colorBulk;
  const bwMegaDuplex = Math.max(2.0, Math.round(bwBulkDuplex * 0.85 * 2) / 2);
  const colorMegaDuplex = Math.max(4.0, Math.round(colorBulkDuplex * 0.85 * 2) / 2);

  return {
    standard: {
      bw: { single: bwSingle, duplex: bwDuplex },
      color: { single: colorSingle, duplex: colorDuplex },
    },
    assignment: {
      bw: { single: bwBulk, duplex: bwBulkDuplex },
      color: { single: colorBulk, duplex: colorBulkDuplex },
    },
    mega: {
      bw: { single: bwMegaSingle, duplex: bwMegaDuplex },
      color: { single: colorMegaSingle, duplex: colorMegaDuplex },
    },
  };
}

/**
 * Retrieves pricing configuration for a specific station from Cloudflare D1.
 */
export async function getStationPricing(stationId: string): Promise<StationPricingConfig> {
  const normId = (stationId || 'block_b').toLowerCase().trim();
  
  // 1. Check memory cache
  const cached = pricingCache.get(normId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.config;
  }

  const defaultPricing = getDefaultStationPricing(normId);

  try {
    const key = `station_pricing_${normId}`;
    const rows = await queryD1<{ key: string; value: string; updated_at: string }>(
      `SELECT key, value, updated_at FROM app_settings WHERE key = ? LIMIT 1`,
      [key]
    );

    if (rows && rows.length > 0) {
      const parsed = JSON.parse(rows[0].value);
      const merged: StationPricingConfig = {
        ...defaultPricing,
        ...parsed,
        stationId: normId,
        updatedAt: rows[0].updated_at || parsed.updatedAt,
      };

      pricingCache.set(normId, { config: merged, timestamp: Date.now() });
      return merged;
    }
  } catch (err) {
    console.warn(`Could not load pricing for station ${normId} from D1, using defaults:`, err);
  }

  pricingCache.set(normId, { config: defaultPricing, timestamp: Date.now() });
  return defaultPricing;
}

/**
 * Saves updated pricing configuration for a station to Cloudflare D1.
 */
export async function saveStationPricing(
  stationId: string,
  updates: Partial<StationPricingConfig>
): Promise<{ success: boolean; config?: StationPricingConfig; error?: string }> {
  const normId = (stationId || 'block_b').toLowerCase().trim();

  // Validate guardrails
  const validation = validatePricingGuardrails(updates);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  const existing = await getStationPricing(normId);
  const merged: StationPricingConfig = {
    ...existing,
    ...updates,
    stationId: normId,
    updatedAt: new Date().toISOString(),
  };

  try {
    const key = `station_pricing_${normId}`;
    const valueStr = JSON.stringify(merged);

    await executeD1(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    const ok = await executeD1(
      `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, valueStr]
    );

    if (ok) {
      pricingCache.set(normId, { config: merged, timestamp: Date.now() });
      return { success: true, config: merged };
    }

    return { success: false, error: 'Database execution returned false' };
  } catch (err: unknown) {
    console.error(`Failed to save pricing for station ${normId}:`, err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown database error' };
  }
}

/**
 * Retrieves pricing configuration for all configured campus stations.
 */
export async function getAllStationsPricing(): Promise<Record<string, StationPricingConfig>> {
  const result: Record<string, StationPricingConfig> = {};
  const stationKeys = Object.keys(STATIONS);

  await Promise.all(
    stationKeys.map(async (key) => {
      const config = await getStationPricing(key);
      result[key] = config;
    })
  );

  return result;
}
