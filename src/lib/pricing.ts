/**
 * NERIST PRICING ENGINE LOGIC (ONLINE INCENTIVE PRICING)
 * 
 * Online Web App Student Rates:
 * 1. Standard (1 – 9 sheets):
 *    - B&W Single: ₹3.00 (vs ₹5.00 offline counter rate)
 *    - Color Single: ₹5.00 (vs ₹10.00 offline counter rate)
 * 
 * 2. Assignment Saver (10 – 29 sheets):
 *    - B&W Single: ₹2.50 (Save extra!)
 *    - Color Single: ₹4.50
 * 
 * 3. Mega Bulk Saver (30+ sheets - Notes, Manuals, Projects):
 *    - B&W Single: ₹2.00
 *    - Color Single: ₹4.00
 */

export interface PageConfig {
  pageNumber: number;
  colorMode: 'bw' | 'color';
  included: boolean;
  orientation?: 'portrait' | 'landscape';
  naturalOrientation?: 'portrait' | 'landscape';
  rotation?: number; // 0, 90, 180, 270
  copies?: number; // Specific copies for this page (min 1, default 1)
  customScale?: number; // Per-page custom scale percentage (e.g. 100 = 100%)
}

import { LayoutMode } from './layout-types';

export interface PricingInput {
  totalPages: number;
  colorMode: 'bw' | 'color' | 'custom';
  isDuplex: boolean;
  copies: number;
  pageConfigs?: PageConfig[];
  layoutMode?: LayoutMode;
  customCols?: number;
  customRows?: number;
}

export interface PricingResult {
  totalPages: number;
  colorMode: 'bw' | 'color' | 'custom';
  isDuplex: boolean;
  copies: number;
  duplexSheets: number;
  singleSheets: number;
  totalSheets: number;
  unitPrice: number; // Price per copy
  totalPrice: number; // Final payable amount in INR
  originalPrice: number; // Normal offline market counter price
  savings: number; // Total INR saved vs offline
  tierName: 'Standard' | 'Assignment Saver' | 'Mega Bulk Saver';
  nextTierSheetsNeeded: number;
  nextTierName: string | null;
  breakdown: string;
  bwPagesCount: number;
  colorPagesCount: number;
}

export const OFFLINE_MARKET_RATES = {
  bw: { single: 5, duplex: 8 },
  color: { single: 10, duplex: 16 },
} as const;

export const TIER_RATES = {
  standard: {
    bw: { single: 3, duplex: 5 },
    color: { single: 5, duplex: 8 },
  },
  assignment: {
    bw: { single: 2.5, duplex: 4 },
    color: { single: 4.5, duplex: 7 },
  },
  mega: {
    bw: { single: 2.0, duplex: 3.5 },
    color: { single: 4.0, duplex: 6 },
  },
} as const;

export const RATES = TIER_RATES.standard;

function getActiveTier(sheetCount: number) {
  if (sheetCount >= 30) {
    return {
      tierKey: 'mega' as const,
      tierName: 'Mega Bulk Saver' as const,
      rates: TIER_RATES.mega,
      nextTierSheetsNeeded: 0,
      nextTierName: null,
    };
  }
  if (sheetCount >= 10) {
    return {
      tierKey: 'assignment' as const,
      tierName: 'Assignment Saver' as const,
      rates: TIER_RATES.assignment,
      nextTierSheetsNeeded: 30 - sheetCount,
      nextTierName: 'Mega Bulk Saver (₹2.00/pg)',
    };
  }
  return {
    tierKey: 'standard' as const,
    tierName: 'Standard' as const,
    rates: TIER_RATES.standard,
    nextTierSheetsNeeded: 10 - sheetCount,
    nextTierName: 'Assignment Saver (₹2.50/pg)',
  };
}

export function calculatePricing(input: PricingInput): PricingResult {
  const { totalPages, colorMode, isDuplex = false, copies = 1, pageConfigs, layoutMode = '1-up' } = input;
  const safeCopies = Math.max(1, Math.floor(copies));

  // Determine page division factor based on layout mode
  const pagesPerSide =
    layoutMode === 'custom' && input.customCols && input.customRows
      ? Math.max(1, input.customCols * input.customRows)
      : layoutMode === '2-up' || layoutMode === 'id-card'
      ? 2
      : layoutMode === '4-up'
      ? 4
      : layoutMode === '6-up'
      ? 6
      : layoutMode === '8-up'
      ? 8
      : layoutMode === '9-up'
      ? 9
      : layoutMode === '16-up'
      ? 16
      : 1;

  // If pageConfigs are provided, calculate per-page hybrid pricing
  if (pageConfigs && pageConfigs.length > 0) {
    const includedPages = pageConfigs.filter((p) => p.included);
    const activeTotal = includedPages.length;

    if (activeTotal === 0) {
      return {
        totalPages: 0,
        colorMode,
        isDuplex: false,
        copies: safeCopies,
        duplexSheets: 0,
        singleSheets: 0,
        totalSheets: 0,
        unitPrice: 0,
        totalPrice: 0,
        originalPrice: 0,
        savings: 0,
        tierName: 'Standard',
        nextTierSheetsNeeded: 10,
        nextTierName: 'Assignment Saver (₹2.50/pg)',
        breakdown: 'No pages selected',
        bwPagesCount: 0,
        colorPagesCount: 0,
      };
    }

    // Expand pages according to per-page copies
    const expandedPages: { colorMode: 'bw' | 'color'; pageNumber: number }[] = [];
    let bwPagesCount = 0;
    let colorPagesCount = 0;

    includedPages.forEach((p) => {
      const pageCopies = Math.max(1, Math.floor(p.copies || 1));
      for (let i = 0; i < pageCopies; i++) {
        expandedPages.push({ colorMode: p.colorMode, pageNumber: p.pageNumber });
        if (p.colorMode === 'color') colorPagesCount++;
        else bwPagesCount++;
      }
    });

    const totalExpandedCount = expandedPages.length;
    const effectiveSidesCount = Math.ceil(totalExpandedCount / pagesPerSide);

    let duplexSheets = 0;
    let singleSheets = 0;

    if (!isDuplex) {
      singleSheets = effectiveSidesCount;
    } else {
      duplexSheets = Math.floor(effectiveSidesCount / 2);
      singleSheets = effectiveSidesCount % 2;
    }

    const totalSheetsPerCopy = duplexSheets + singleSheets;
    const totalPhysicalSheets = totalSheetsPerCopy * safeCopies;
    const tier = getActiveTier(totalPhysicalSheets);

    // Group pages onto physical sides and accurately detect whether each side contains color
    const sideColorModes: ('color' | 'bw')[] = [];
    for (let i = 0; i < totalExpandedCount; i += pagesPerSide) {
      const sidePages = expandedPages.slice(i, i + pagesPerSide);
      const hasColor = sidePages.some((p) => p.colorMode === 'color');
      sideColorModes.push(hasColor ? 'color' : 'bw');
    }

    let effectiveBwCount = 0;
    let effectiveColorCount = 0;
    sideColorModes.forEach((mode) => {
      if (mode === 'color') effectiveColorCount++;
      else effectiveBwCount++;
    });

    // Calculate at active tier rate vs offline market comparison
    let unitPrice = 0;
    let offlineMarketUnitPrice = 0;
    const parts: string[] = [];

    if (!isDuplex) {
      unitPrice = (effectiveBwCount * tier.rates.bw.single) + (effectiveColorCount * tier.rates.color.single);
      offlineMarketUnitPrice = (effectiveBwCount * OFFLINE_MARKET_RATES.bw.single) + (effectiveColorCount * OFFLINE_MARKET_RATES.color.single);

      if (effectiveBwCount > 0) {
        parts.push(`${effectiveBwCount} B&W Sheet${effectiveBwCount > 1 ? 's' : ''} (₹${tier.rates.bw.single} ea)`);
      }
      if (effectiveColorCount > 0) {
        parts.push(`${effectiveColorCount} Color Sheet${effectiveColorCount > 1 ? 's' : ''} (₹${tier.rates.color.single} ea)`);
      }
    } else {
      let bwDuplexCount = 0;
      let colorDuplexCount = 0;

      for (let i = 0; i < sideColorModes.length; i += 2) {
        if (i + 1 < sideColorModes.length) {
          const hasColor = sideColorModes[i] === 'color' || sideColorModes[i + 1] === 'color';
          if (hasColor) {
            colorDuplexCount++;
            unitPrice += tier.rates.color.duplex;
            offlineMarketUnitPrice += OFFLINE_MARKET_RATES.color.duplex;
          } else {
            bwDuplexCount++;
            unitPrice += tier.rates.bw.duplex;
            offlineMarketUnitPrice += OFFLINE_MARKET_RATES.bw.duplex;
          }
        } else {
          const hasColor = sideColorModes[i] === 'color';
          const singleRate = hasColor ? tier.rates.color.single : tier.rates.bw.single;
          const offlineRate = hasColor ? OFFLINE_MARKET_RATES.color.single : OFFLINE_MARKET_RATES.bw.single;
          unitPrice += singleRate;
          offlineMarketUnitPrice += offlineRate;
          parts.push(`1 Single ${hasColor ? 'Color' : 'B&W'} (₹${singleRate})`);
        }
      }

      if (bwDuplexCount > 0) {
        parts.push(`${bwDuplexCount} B&W Double-Sided (₹${tier.rates.bw.duplex} ea)`);
      }
      if (colorDuplexCount > 0) {
        parts.push(`${colorDuplexCount} Color Double-Sided (₹${tier.rates.color.duplex} ea)`);
      }
    }

    if (pagesPerSide > 1) {
      parts.push(`[${layoutMode === 'id-card' ? '2-in-1 ID Card' : `${pagesPerSide}-on-1`} Layout]`);
    }

    const finalTotalPrice = Math.round(unitPrice * safeCopies);
    const finalOriginalPrice = Math.round(offlineMarketUnitPrice * safeCopies);
    const savings = Math.max(0, finalOriginalPrice - finalTotalPrice);

    let breakdownStr = parts.join(' + ');
    if (safeCopies > 1) {
      breakdownStr = `(${breakdownStr}) × ${safeCopies} copies`;
    }
    if (tier.tierKey !== 'standard') {
      breakdownStr += ` [${tier.tierName} Applied]`;
    }

    return {
      totalPages: totalExpandedCount,
      colorMode: colorPagesCount > 0 && bwPagesCount > 0 ? 'custom' : colorPagesCount > 0 ? 'color' : 'bw',
      isDuplex,
      copies: safeCopies,
      duplexSheets,
      singleSheets,
      totalSheets: totalPhysicalSheets,
      unitPrice,
      totalPrice: finalTotalPrice,
      originalPrice: finalOriginalPrice,
      savings,
      tierName: tier.tierName,
      nextTierSheetsNeeded: tier.nextTierSheetsNeeded,
      nextTierName: tier.nextTierName,
      breakdown: breakdownStr,
      bwPagesCount,
      colorPagesCount,
    };
  }

  // Uniform pricing fallback
  const safePages = Math.max(1, Math.floor(totalPages));
  const effectiveMode = colorMode === 'color' ? 'color' : 'bw';
  const effectivePhysicalPages = Math.ceil(safePages / pagesPerSide);

  let duplexSheets = 0;
  let singleSheets = 0;
  if (isDuplex) {
    duplexSheets = Math.floor(effectivePhysicalPages / 2);
    singleSheets = effectivePhysicalPages % 2;
  } else {
    singleSheets = effectivePhysicalPages;
  }

  const totalSheetsPerCopy = duplexSheets + singleSheets;
  const totalPhysicalSheets = totalSheetsPerCopy * safeCopies;
  const tier = getActiveTier(totalPhysicalSheets);

  const activeRates = tier.rates[effectiveMode];
  const offlineRates = OFFLINE_MARKET_RATES[effectiveMode];

  let unitPrice = 0;
  let offlineUnitPrice = 0;
  let breakdown = '';

  if (isDuplex) {
    unitPrice = (duplexSheets * activeRates.duplex) + (singleSheets * activeRates.single);
    offlineUnitPrice = (duplexSheets * offlineRates.duplex) + (singleSheets * offlineRates.single);

    const parts: string[] = [];
    if (duplexSheets > 0) {
      parts.push(`${duplexSheets} Double-Sided (₹${activeRates.duplex} ea)`);
    }
    if (singleSheets > 0) {
      parts.push(`${singleSheets} Single (₹${activeRates.single})`);
    }
    breakdown = parts.join(' + ');
  } else {
    unitPrice = safePages * activeRates.single;
    offlineUnitPrice = safePages * offlineRates.single;
    breakdown = `${safePages} Single-Sided (₹${activeRates.single} ea)`;
  }

  const rawTotalPrice = Math.round(unitPrice * safeCopies);
  const rawOriginalPrice = Math.round(offlineUnitPrice * safeCopies);
  const savings = Math.max(0, rawOriginalPrice - rawTotalPrice);

  return {
    totalPages: safePages,
    colorMode: effectiveMode,
    isDuplex,
    copies: safeCopies,
    duplexSheets,
    singleSheets,
    totalSheets: totalSheetsPerCopy,
    unitPrice,
    totalPrice: rawTotalPrice,
    originalPrice: rawOriginalPrice,
    savings,
    tierName: tier.tierName,
    nextTierSheetsNeeded: tier.nextTierSheetsNeeded,
    nextTierName: tier.nextTierName,
    breakdown,
    bwPagesCount: effectiveMode === 'bw' ? safePages : 0,
    colorPagesCount: effectiveMode === 'color' ? safePages : 0,
  };
}
