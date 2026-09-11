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
  copies?: number; // Specific copies for this page (min 1, default 1)
  customScale?: number; // Per-page custom scale percentage (e.g. 100 = 100%)
}

export interface PricingInput {
  totalPages: number;
  colorMode: 'bw' | 'color' | 'custom';
  isDuplex: boolean;
  copies: number;
  pageConfigs?: PageConfig[];
  layoutMode?: '1-up' | '2-up' | 'id-card' | '4-up' | '6-up' | '8-up' | '9-up' | '16-up' | 'custom' | 'booklet' | 'poster';
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
  const { totalPages, colorMode, isDuplex, copies = 1, pageConfigs, layoutMode = '1-up' } = input;
  const safeCopies = Math.max(1, Math.floor(copies));

  // Determine page division factor based on layout mode
  const pagesPerSide =
    layoutMode === 'custom' && input.customCols && input.customRows
      ? Math.max(1, input.customCols * input.customRows)
      : layoutMode === '2-up' || layoutMode === 'id-card' || layoutMode === 'booklet'
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
    const isPoster = layoutMode === 'poster';

    // Poster tiles 1 document page into 4 physical A4 sheets (2x2 grid, simplex wall mounted)
    const effectiveSidesCount = isPoster
      ? totalExpandedCount * 4
      : Math.ceil(totalExpandedCount / pagesPerSide);

    let duplexSheets = 0;
    let singleSheets = 0;

    if (!isDuplex || isPoster) {
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
    if (isPoster) {
      expandedPages.forEach((p) => {
        for (let tile = 0; tile < 4; tile++) {
          sideColorModes.push(p.colorMode);
        }
      });
    } else {
      for (let i = 0; i < totalExpandedCount; i += pagesPerSide) {
        const sidePages = expandedPages.slice(i, i + pagesPerSide);
        const hasColor = sidePages.some((p) => p.colorMode === 'color');
        sideColorModes.push(hasColor ? 'color' : 'bw');
      }
    }

    let effectiveBwCount = 0;
    let effectiveColorCount = 0;
    sideColorModes.forEach((mode) => {
      if (mode === 'color') effectiveColorCount++;
      else effectiveBwCount++;
    });

    // Calculate at active tier rate
    let unitPrice = 0;
    let originalUnitPrice = 0;
    const parts: string[] = [];

    if (!isDuplex || isPoster) {
      unitPrice = (effectiveBwCount * tier.rates.bw.single) + (effectiveColorCount * tier.rates.color.single);
      originalUnitPrice = (effectiveBwCount * TIER_RATES.standard.bw.single) + (effectiveColorCount * TIER_RATES.standard.color.single);

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
            originalUnitPrice += TIER_RATES.standard.color.duplex;
          } else {
            bwDuplexCount++;
            unitPrice += tier.rates.bw.duplex;
            originalUnitPrice += TIER_RATES.standard.bw.duplex;
          }
        } else {
          const hasColor = sideColorModes[i] === 'color';
          const singleRate = hasColor ? tier.rates.color.single : tier.rates.bw.single;
          const origSingleRate = hasColor ? TIER_RATES.standard.color.single : TIER_RATES.standard.bw.single;
          unitPrice += singleRate;
          originalUnitPrice += origSingleRate;
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

    if (isPoster) {
      parts.push(`[2x2 Poster Layout · 4 Sheets/pg]`);
    } else if (pagesPerSide > 1) {
      parts.push(`[${layoutMode === 'id-card' ? '2-in-1 ID Card' : `${pagesPerSide}-on-1`} Layout]`);
    }

    const finalTotalPrice = unitPrice * safeCopies;
    const finalOriginalPrice = originalUnitPrice * safeCopies;
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
  const isPoster = layoutMode === 'poster';
  const effectivePhysicalPages = isPoster ? safePages * 4 : Math.ceil(safePages / pagesPerSide);

  let duplexSheets = 0;
  let singleSheets = 0;
  if (isDuplex && !isPoster) {
    duplexSheets = Math.floor(effectivePhysicalPages / 2);
    singleSheets = effectivePhysicalPages % 2;
  } else {
    singleSheets = effectivePhysicalPages;
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
