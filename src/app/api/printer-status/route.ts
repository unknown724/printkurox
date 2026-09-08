import { NextResponse } from 'next/server';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const CF_D1_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID!;

async function queryD1(sql: string) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DB_ID}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
    // No-store so we always get a fresh result
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.result?.[0]?.results ?? null;
}

// Ensure the heartbeat table exists (runs on first call)
async function ensureTable() {
  await queryD1(`
    CREATE TABLE IF NOT EXISTS daemon_heartbeat (
      id INTEGER PRIMARY KEY DEFAULT 1,
      updated_at TEXT NOT NULL
    )
  `);
  await queryD1(`
    INSERT OR IGNORE INTO daemon_heartbeat (id, updated_at) VALUES (1, datetime('now'))
  `);
}

export async function GET() {
  try {
    let rows = await queryD1('SELECT updated_at FROM daemon_heartbeat WHERE id = 1');
    if (rows === null) {
      await ensureTable();
      rows = await queryD1('SELECT updated_at FROM daemon_heartbeat WHERE id = 1');
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ online: false, lastSeen: null }, { status: 200 });
    }

    const lastSeen: string = rows[0].updated_at;
    // Parse UTC datetime from SQLite (format: "2024-01-01 12:00:00")
    const lastSeenDate = new Date(lastSeen.replace(' ', 'T') + 'Z');
    const ageSeconds = (Date.now() - lastSeenDate.getTime()) / 1000;

    // Printer considered online if heartbeat is within 90 seconds
    const online = ageSeconds <= 90;

    return NextResponse.json(
      { online, lastSeen, ageSeconds: Math.round(ageSeconds) },
      {
        status: 200,
        headers: {
          // Cache for 20 seconds max on CDN
          'Cache-Control': 'public, max-age=20, stale-while-revalidate=30',
        },
      }
    );
  } catch (err) {
    console.error('[printer-status]', err);
    // If we can't reach D1, report offline
    return NextResponse.json({ online: false, lastSeen: null }, { status: 200 });
  }
}
