/**
 * Cloudflare D1 REST API Client
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '948fd75d8b84a5cf20559d6aa789d4dd';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || '3f4d4547-e86b-4cdd-a867-9ebba19c12c9';

export interface PrintJobRecord {
  id: string;
  pickup_code: string;
  file_key: string;
  file_name: string;
  total_pages: number;
  page_range: string;
  color_mode: 'bw' | 'color';
  is_duplex: number; // 0 or 1
  copies: number;
  duplex_sheets: number;
  single_sheets: number;
  total_price: number;
  payment_id: string | null;
  order_id: string | null;
  status: 'PENDING_PAYMENT' | 'PAID' | 'PRINTING' | 'PRINTING_ODD' | 'AWAITING_FLIP' | 'PRINTING_EVEN' | 'COMPLETED' | 'FAILED';
  station_id?: string | null;
  orientation?: 'portrait' | 'landscape' | 'auto';
  page_configs?: string | null;
  created_at: string;
  expires_at: string;
}

export interface PrinterSuppliesRecord {
  id: number;
  black_pages_remaining: number;
  color_pages_remaining: number;
  black_capacity: number;
  color_capacity: number;
  paper_sheets_remaining: number;
  paper_capacity: number;
  last_black_refill: string | null;
  last_color_refill: string | null;
  last_paper_refill: string | null;
  updated_at: string;
  // Hardware EEPROM & 4-Chamber EcoTank calibration:
  hardware_total_pages?: number;
  hardware_color_pages?: number;
  hardware_bw_pages?: number;
  hardware_serial?: string;
  hardware_firmware?: string;
  hardware_first_printed?: string;
  hardware_synced_at?: string;
  printer_model?: string;
  bk_pct?: number;
  c_pct?: number;
  m_pct?: number;
  y_pct?: number;
  bk_pages_remaining?: number;
  c_pages_remaining?: number;
  m_pages_remaining?: number;
  y_pages_remaining?: number;
}

export interface PrinterTelemetryRecord {
  id: number;
  printer_name: string;
  is_online: number;
  status_code: number;
  status_text: string;
  spooler_jobs: number;
  updated_at: string;
}

async function postD1Query(sql: string, params: (string | number | null)[] = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PrintKuroxServer/1.0',
      },
      body: JSON.stringify({
        sql,
        params,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 429 || (response.status >= 502 && response.status <= 504)) {
      if (attempt < maxAttempts - 1) {
        const retryAfterSec = Number(response.headers.get('retry-after') || '0');
        const delayMs = retryAfterSec > 0
          ? Math.min(5000, Math.max(250, retryAfterSec * 1000))
          : Math.min(3000, 350 * (attempt + 1));
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare D1 Query Failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  throw new Error('Cloudflare D1 Query Failed after retries');
}

export async function queryD1<T = unknown>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
  const data = await postD1Query(sql, params);
  if (!data.success) {
    throw new Error(`D1 Error: ${JSON.stringify(data.errors || data.messages)}`);
  }

  const queryResult = data.result?.[0];
  return (queryResult?.results as T[]) || [];
}

export async function executeD1(sql: string, params: (string | number | null)[] = []): Promise<boolean> {
  const data = await postD1Query(sql, params);
  return data.success === true;
}

