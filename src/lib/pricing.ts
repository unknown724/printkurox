/**
 * PRICING ENGINE LOGIC (STRICT)
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
 * When an odd number of pages (e.g. 5 pages) is submitted for duplex printing:
 * - duplex_sheets = Math.floor(totalPages / 2)
 * - single_sheets = totalPages % 2
 * - Total Price = ((duplex_sheets * duplex_rate) + (single_sheets * single_rate)) * copies
 */

export interface PricingInput {
  totalPages: number;
  colorMode: 'bw' | 'color';
  isDuplex: boolean;
  copies: number;
}

export interface PricingResult {
  totalPages: number;
  colorMode: 'bw' | 'color';
  isDuplex: boolean;
  copies: number;
  duplexSheets: number;
  singleSheets: number;
  totalSheets: number;
  unitPrice: number; // Price per copy
  totalPrice: number; // Final payable amount in INR
  breakdown: string;
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
  const { totalPages, colorMode, isDuplex, copies = 1 } = input;
  const safePages = Math.max(1, Math.floor(totalPages));
  const safeCopies = Math.max(1, Math.floor(copies));
  const rates = RATES[colorMode];

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
      parts.push(`${duplexSheets} Duplex Sheet${duplexSheets > 1 ? 's' : ''} (₹${rates.duplex} ea)`);
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
    colorMode,
    isDuplex,
    copies: safeCopies,
    duplexSheets,
    singleSheets,
    totalSheets,
    unitPrice,
    totalPrice,
    breakdown,
  };
}
