/**
 * NERIST PRICING ENGINE LOGIC (ONLINE INCENTIVE PRICING)
 * 
 * Online Web App Student Rates:
 * 1. Standard (1 – 9 sheets):
 *    - B&W Single: ₹4.00 (vs ₹5.00 offline counter rate)
 *    - Color Single: ₹7.00 (vs ₹10.00 offline counter rate)
 *    - B&W Duplex: ₹6.00 (₹3.00/side)
 *    - Color Duplex: ₹10.00 (₹5.00/side)
 * 
 * 2. Volume Bulk Saver (10+ sheets, Single-Sided Only):
 *    - B&W Single: ₹3.00 (vs ₹4.00 standard rate)
 *    - Color Single: ₹5.00 (vs ₹7.00 standard rate)
 *    - Duplex: Standard duplex rate applies (₹6.00 B&W, ₹10.00 Color)
 *    - Floor rate: Minimum rate is ₹3.00 (B&W) and ₹5.00 (Color)
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

export interface CustomTierRates {
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

export interface PricingInput {
  totalPages: number;
  colorMode: 'bw' | 'color' | 'custom';
  isDuplex: boolean;
  copies: number;
  pageConfigs?: PageConfig[];
  layoutMode?: LayoutMode;
  customCols?: number;
  customRows?: number;
  customRates?: CustomTierRates;
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
    bw: { single: 4, duplex: 6 },
    color: { single: 7, duplex: 10 },
  },
  assignment: {
    bw: { single: 3.0, duplex: 6 },
    color: { single: 5.0, duplex: 10 },
  },
  mega: {
    bw: { single: 3.0, duplex: 6 },
    color: { single: 5.0, duplex: 10 },
  },
} as const;

export const RATES = TIER_RATES.standard;

function getActiveTier(sheetCount: number, customRates?: CustomTierRates) {
  const activeTiers = customRates || TIER_RATES;
  if (sheetCount >= 10) {
    return {
      tierKey: 'assignment' as const,
      tierName: 'Assignment Saver' as const,
      rates: activeTiers.assignment,
      nextTierSheetsNeeded: 0,
      nextTierName: null,
    };
  }
  return {
    tierKey: 'standard' as const,
    tierName: 'Standard' as const,
    rates: activeTiers.standard,
    nextTierSheetsNeeded: 10 - sheetCount,
    nextTierName: `Bulk Offer (₹${activeTiers.assignment.bw.single.toFixed(2)}/pg)`,
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
        nextTierName: 'Bulk Offer (₹3.00/pg)',
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
    const tier = getActiveTier(totalPhysicalSheets, input.customRates);

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

    // Calculate at active tier rate vs base standard price (4 B&W / 7 Color)
    const standardRates = (input.customRates || TIER_RATES).standard;
    let unitPrice = 0;
    let standardUnitPrice = 0;
    const parts: string[] = [];

    if (!isDuplex) {
      unitPrice = (effectiveBwCount * tier.rates.bw.single) + (effectiveColorCount * tier.rates.color.single);
      standardUnitPrice = (effectiveBwCount * standardRates.bw.single) + (effectiveColorCount * standardRates.color.single);

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
            standardUnitPrice += standardRates.color.duplex;
          } else {
            bwDuplexCount++;
            unitPrice += tier.rates.bw.duplex;
            standardUnitPrice += standardRates.bw.duplex;
          }
        } else {
          const hasColor = sideColorModes[i] === 'color';
          const singleRate = hasColor ? tier.rates.color.single : tier.rates.bw.single;
          const stdRate = hasColor ? standardRates.color.single : standardRates.bw.single;
          unitPrice += singleRate;
          standardUnitPrice += stdRate;
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
    const finalStandardPrice = Math.round(standardUnitPrice * safeCopies);
    const savings = tier.tierKey !== 'standard' ? Math.max(0, finalStandardPrice - finalTotalPrice) : 0;
    const finalOriginalPrice = savings > 0 ? finalStandardPrice : finalTotalPrice;

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
  const tier = getActiveTier(totalPhysicalSheets, input.customRates);

  const activeRates = tier.rates[effectiveMode];
  const standardRates = (input.customRates || TIER_RATES).standard[effectiveMode];

  let unitPrice = 0;
  let standardUnitPrice = 0;
  let breakdown = '';

  if (isDuplex) {
    unitPrice = (duplexSheets * activeRates.duplex) + (singleSheets * activeRates.single);
    standardUnitPrice = (duplexSheets * standardRates.duplex) + (singleSheets * standardRates.single);

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
    standardUnitPrice = safePages * standardRates.single;
    breakdown = `${safePages} Single-Sided (₹${activeRates.single} ea)`;
  }

  const rawTotalPrice = Math.round(unitPrice * safeCopies);
  const rawStandardPrice = Math.round(standardUnitPrice * safeCopies);
  const savings = tier.tierKey !== 'standard' ? Math.max(0, rawStandardPrice - rawTotalPrice) : 0;
  const rawOriginalPrice = savings > 0 ? rawStandardPrice : rawTotalPrice;

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
