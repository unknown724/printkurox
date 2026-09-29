import { executeD1, queryD1 } from '../src/lib/cloudflare-d1';

async function main() {
  console.log('--- Initializing Settlement & Quota Schema ---');
  
  // 1. Create station_settlements table
  await executeD1(`
    CREATE TABLE IF NOT EXISTS station_settlements (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      commission_amount REAL NOT NULL,
      payout_amount REAL NOT NULL,
      total_jobs INTEGER NOT NULL DEFAULT 0,
      total_pages INTEGER NOT NULL DEFAULT 0,
      period_start DATETIME,
      period_end DATETIME,
      settled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      payment_ref TEXT,
      notes TEXT,
      created_by TEXT DEFAULT 'ADMIN'
    );
  `);
  console.log('✓ Created station_settlements table');

  // 2. Add settlement_id column to print_jobs if not exists
  try {
    await executeD1(`ALTER TABLE print_jobs ADD COLUMN settlement_id TEXT;`);
    console.log('✓ Added settlement_id to print_jobs');
  } catch (e: any) {
    console.log('• settlement_id in print_jobs already exists or:', e?.message || e);
  }

  // 3. Add upi_id and monthly_free_quota to stations if not exists
  try {
    await executeD1(`ALTER TABLE stations ADD COLUMN upi_id TEXT;`);
    console.log('✓ Added upi_id to stations');
  } catch (e: any) {
    console.log('• upi_id in stations already exists or:', e?.message || e);
  }

  try {
    await executeD1(`ALTER TABLE stations ADD COLUMN monthly_free_quota INTEGER DEFAULT 50;`);
    console.log('✓ Added monthly_free_quota to stations');
  } catch (e: any) {
    console.log('• monthly_free_quota in stations already exists or:', e?.message || e);
  }

  const tables = await queryD1<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`);
  console.log('Active tables in D1:', tables.map(t => t.name));
}

main().catch(console.error);
