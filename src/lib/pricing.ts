/**
 * PRICING ENGINE LOGIC (DIRECT PRICE-CUT BULK TIERS)
 * 
 * Direct Volume Price Cut Tiers:
 * 1. Standard (1 – 9 sheets):
 *    - B&W Single: ₹4.00 | B&W Double: ₹6.00
 *    - Color Single: ₹7.00 | Color Double: ₹10.00
 * 
 * 2. Assignment Saver (10 – 29 sheets):
 *    - B&W Single: ₹3.00 (Save 25%!) | B&W Double: ₹5.00
 *    - Color Single: ₹6.00 | Color Double: ₹8.00
 * 
 * 3. Mega Bulk Saver (30+ sheets - Notes, Manuals, Thesis):
 *    - B&W Single: ₹2.50 (Save 37.5%!) | B&W Double: ₹4.00 (₹2/page!)
 *    - Color Single: ₹5.00 | Color Double: ₹7.00
 */

export interface PageConfig {
  pageNumber: number;
  colorMode: 'bw' | 'color';
  included: boolean;
  orientation?: 'portrait' | 'landscape';
  rotation?: number; // 0, 90, 180, 270
}

export interface PricingInput {
  totalPages: number;
  colorMode: 'bw' | 'color' | 'custom';
  isDuplex: boolean;
  copies: number;
  pageConfigs?: PageConfig[];
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
  originalPrice: number; // Price before volume discount
  savings: number; // Total INR saved
  tierName: 'Standard' | 'Assignment Saver' | 'Mega Bulk Saver';
  nextTierSheetsNeeded: number;
  nextTierName: string | null;
  breakdown: string;
  bwPagesCount: number;
  colorPagesCount: number;
}

export const TIER_RATES = {
  standard: {
    bw: { single: 4, duplex: 6 },
    color: { single: 7, duplex: 10 },
  },
  assignment: {
    bw: { single: 3, duplex: 5 },
    color: { single: 6, duplex: 8 },
  },
  mega: {
    bw: { single: 2.5, duplex: 4 },
    color: { single: 5, duplex: 7 },
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
      nextTierName: 'Mega Bulk Saver (₹2.50/pg)',
    };
  }
  return {
    tierKey: 'standard' as const,
    tierName: 'Standard' as const,
    rates: TIER_RATES.standard,
    nextTierSheetsNeeded: 10 - sheetCount,
    nextTierName: 'Assignment Saver (₹3/pg)',
  };
}

export function calculatePricing(input: PricingInput): PricingResult {
  const { totalPages, colorMode, isDuplex, copies = 1, pageConfigs } = input;
  const safeCopies = Math.max(1, Math.floor(copies));

  // If pageConfigs are provided, calculate per-page hybrid pricing
  if (pageConfigs && pageConfigs.length > 0) {
    const includedPages = pageConfigs.filter((p) => p.included);
    const activeTotal = includedPages.length;

    if (activeTotal === 0) {
      return {
        totalPages: 0,
        colorMode,
        isDuplex,
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
        nextTierName: 'Assignment Saver (₹3/pg)',
        breakdown: 'No pages selected',
        bwPagesCount: 0,
        colorPagesCount: 0,
      };
    }

    let bwPagesCount = 0;
    let colorPagesCount = 0;
    includedPages.forEach((p) => {
      if (p.colorMode === 'color') colorPagesCount++;
      else bwPagesCount++;
    });

    let duplexSheets = 0;
    let singleSheets = 0;

    if (!isDuplex) {
      singleSheets = activeTotal;
    } else {
      duplexSheets = Math.floor(activeTotal / 2);
      singleSheets = activeTotal % 2;
    }

    const totalSheetsPerCopy = duplexSheets + singleSheets;
    const totalPhysicalSheets = totalSheetsPerCopy * safeCopies;
    const tier = getActiveTier(totalPhysicalSheets);

    // Calculate at active tier rate
    let unitPrice = 0;
    let originalUnitPrice = 0;
    const parts: string[] = [];

    if (!isDuplex) {
      const bwCost = bwPagesCount * tier.rates.bw.single;
      const colorCost = colorPagesCount * tier.rates.color.single;
      unitPrice = bwCost + colorCost;

      const origBwCost = bwPagesCount * TIER_RATES.standard.bw.single;
      const origColorCost = colorPagesCount * TIER_RATES.standard.color.single;
      originalUnitPrice = origBwCost + origColorCost;

      if (bwPagesCount > 0) {
        parts.push(`${bwPagesCount} B&W (${tier.rates.bw.single === 4 ? '₹4' : `₹${tier.rates.bw.single}`} ea)`);
      }
      if (colorPagesCount > 0) {
        parts.push(`${colorPagesCount} Color (₹${tier.rates.color.single} ea)`);
      }
    } else {
      let bwDuplexCount = 0;
      let colorDuplexCount = 0;

      for (let i = 0; i < includedPages.length; i += 2) {
        const page1 = includedPages[i];
        const page2 = includedPages[i + 1];

        if (page2) {
          const isColorSheet = page1.colorMode === 'color' || page2.colorMode === 'color';
          if (isColorSheet) {
            colorDuplexCount++;
            unitPrice += tier.rates.color.duplex;
            originalUnitPrice += TIER_RATES.standard.color.duplex;
          } else {
            bwDuplexCount++;
            unitPrice += tier.rates.bw.duplex;
            originalUnitPrice += TIER_RATES.standard.bw.duplex;
          }
        } else {
          const isColor = page1.colorMode === 'color';
          const singleRate = isColor ? tier.rates.color.single : tier.rates.bw.single;
          const origSingleRate = isColor ? TIER_RATES.standard.color.single : TIER_RATES.standard.bw.single;
          unitPrice += singleRate;
          originalUnitPrice += origSingleRate;
          parts.push(`1 Single ${isColor ? 'Color' : 'B&W'} (₹${singleRate})`);
        }
      }

      if (bwDuplexCount > 0) {
        parts.unshift(`${bwDuplexCount} B&W Double (₹${tier.rates.bw.duplex} ea)`);
      }
      if (colorDuplexCount > 0) {
        parts.unshift(`${colorDuplexCount} Color Double (₹${tier.rates.color.duplex} ea)`);
      }
    }

    const rawTotalPrice = Math.round(unitPrice * safeCopies);
    const rawOriginalPrice = Math.round(originalUnitPrice * safeCopies);
    const savings = Math.max(0, rawOriginalPrice - rawTotalPrice);

    return {
      totalPages: activeTotal,
      colorMode,
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
      breakdown: parts.join(' + ') || `${activeTotal} Sheets`,
      bwPagesCount,
      colorPagesCount,
    };
  }

  // Uniform pricing fallback
  const safePages = Math.max(1, Math.floor(totalPages));
  const effectiveMode = colorMode === 'color' ? 'color' : 'bw';

  let duplexSheets = 0;
  let singleSheets = 0;
  if (isDuplex) {
    duplexSheets = Math.floor(safePages / 2);
    singleSheets = safePages % 2;
  } else {
    singleSheets = safePages;
  }

  const totalSheetsPerCopy = duplexSheets + singleSheets;
  const totalPhysicalSheets = totalSheetsPerCopy * safeCopies;
  const tier = getActiveTier(totalPhysicalSheets);

  const activeRates = tier.rates[effectiveMode];
  const stdRates = TIER_RATES.standard[effectiveMode];

  let unitPrice = 0;
  let originalUnitPrice = 0;
  let breakdown = '';

  if (isDuplex) {
    unitPrice = (duplexSheets * activeRates.duplex) + (singleSheets * activeRates.single);
    originalUnitPrice = (duplexSheets * stdRates.duplex) + (singleSheets * stdRates.single);

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
    originalUnitPrice = safePages * stdRates.single;
    breakdown = `${safePages} Single-Sided (₹${activeRates.single} ea)`;
  }

  const rawTotalPrice = Math.round(unitPrice * safeCopies);
  const rawOriginalPrice = Math.round(originalUnitPrice * safeCopies);
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
