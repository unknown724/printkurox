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
  status: 'PENDING_PAYMENT' | 'PAID' | 'PRINTING_ODD' | 'AWAITING_FLIP' | 'PRINTING_EVEN' | 'COMPLETED' | 'FAILED';
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

export async function queryD1<T = unknown>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare D1 Query Failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`D1 Error: ${JSON.stringify(data.errors || data.messages)}`);
  }

  const queryResult = data.result?.[0];
  return (queryResult?.results as T[]) || [];
}

export async function executeD1(sql: string, params: (string | number | null)[] = []): Promise<boolean> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare D1 Execute Failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.success === true;
}
