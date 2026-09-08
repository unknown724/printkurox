/**
 * PRICING ENGINE LOGIC (STRICT & HYBRID)
 * 
 * Rates:
 * - Black & White:
 *   - Single-sided: ₹4 per sheet (page)
 *   - Double-sided: ₹6 per double-sided sheet
 * - Color:
 *   - Single-sided: ₹7 per sheet (page)
 *   - Double-sided: ₹10 per double-sided sheet
 * 
 * Duplex Odd Page Handling:
 * When an odd number of pages is submitted for duplex printing:
 * - Pairs of pages are printed on double-sided sheets
 * - Remaining single side is charged at the single-sided rate
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
  breakdown: string;
  bwPagesCount: number;
  colorPagesCount: number;
}

export const RATES = {
  bw: {
    single: 4,
    duplex: 6,
  },
  color: {
    single: 7,
    duplex: 10,
  },
} as const;

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
    let unitPrice = 0;
    const parts: string[] = [];

    if (!isDuplex) {
      // Simplex (Single-sided)
      singleSheets = activeTotal;
      const bwCost = bwPagesCount * RATES.bw.single;
      const colorCost = colorPagesCount * RATES.color.single;
      unitPrice = bwCost + colorCost;

      if (bwPagesCount > 0) {
        parts.push(`${bwPagesCount} B&W Sheet${bwPagesCount > 1 ? 's' : ''} (₹${RATES.bw.single} ea)`);
      }
      if (colorPagesCount > 0) {
        parts.push(`${colorPagesCount} Color Sheet${colorPagesCount > 1 ? 's' : ''} (₹${RATES.color.single} ea)`);
      }
    } else {
      // Duplex (Double-sided)
      // Group pages into consecutive pairs for physical sheets
      let bwDuplexCount = 0;
      let colorDuplexCount = 0;

      for (let i = 0; i < includedPages.length; i += 2) {
        const page1 = includedPages[i];
        const page2 = includedPages[i + 1];

        if (page2) {
          // Both sides present on this sheet
          duplexSheets++;
          const isColorSheet = page1.colorMode === 'color' || page2.colorMode === 'color';
          if (isColorSheet) {
            colorDuplexCount++;
            unitPrice += RATES.color.duplex;
          } else {
            bwDuplexCount++;
            unitPrice += RATES.bw.duplex;
          }
        } else {
          // Lone single page on the final sheet
          singleSheets++;
          const singleRate = page1.colorMode === 'color' ? RATES.color.single : RATES.bw.single;
          unitPrice += singleRate;
          parts.push(`1 Single ${page1.colorMode === 'color' ? 'Color' : 'B&W'} Sheet (₹${singleRate})`);
        }
      }

      if (bwDuplexCount > 0) {
        parts.unshift(`${bwDuplexCount} B&W Double-Sided Sheet${bwDuplexCount > 1 ? 's' : ''} (₹${RATES.bw.duplex} ea)`);
      }
      if (colorDuplexCount > 0) {
        parts.unshift(`${colorDuplexCount} Color Double-Sided Sheet${colorDuplexCount > 1 ? 's' : ''} (₹${RATES.color.duplex} ea)`);
      }
    }

    const totalSheets = duplexSheets + singleSheets;
    const totalPrice = unitPrice * safeCopies;

    return {
      totalPages: activeTotal,
      colorMode,
      isDuplex,
      copies: safeCopies,
      duplexSheets,
      singleSheets,
      totalSheets,
      unitPrice,
      totalPrice,
      breakdown: parts.join(' + ') || `${activeTotal} Sheets`,
      bwPagesCount,
      colorPagesCount,
    };
  }

  // Uniform pricing fallback
  const safePages = Math.max(1, Math.floor(totalPages));
  const effectiveMode = colorMode === 'color' ? 'color' : 'bw';
  const rates = RATES[effectiveMode];

  let duplexSheets = 0;
  let singleSheets = 0;
  let unitPrice = 0;
  let breakdown = '';

  if (isDuplex) {
    duplexSheets = Math.floor(safePages / 2);
    singleSheets = safePages % 2;
    unitPrice = (duplexSheets * rates.duplex) + (singleSheets * rates.single);

    const parts: string[] = [];
    if (duplexSheets > 0) {
      parts.push(`${duplexSheets} Double-Sided Sheet${duplexSheets > 1 ? 's' : ''} (₹${rates.duplex} ea)`);
    }
    if (singleSheets > 0) {
      parts.push(`${singleSheets} Single Sheet (₹${rates.single})`);
    }
    breakdown = parts.join(' + ');
  } else {
    duplexSheets = 0;
    singleSheets = safePages;
    unitPrice = safePages * rates.single;
    breakdown = `${safePages} Single-Sided Sheet${safePages > 1 ? 's' : ''} (₹${rates.single} ea)`;
  }

  const totalSheets = duplexSheets + singleSheets;
  const totalPrice = unitPrice * safeCopies;

  return {
    totalPages: safePages,
    colorMode: effectiveMode,
    isDuplex,
    copies: safeCopies,
    duplexSheets,
    singleSheets,
    totalSheets,
    unitPrice,
    totalPrice,
    breakdown,
    bwPagesCount: effectiveMode === 'bw' ? safePages : 0,
    colorPagesCount: effectiveMode === 'color' ? safePages : 0,
  };
}
