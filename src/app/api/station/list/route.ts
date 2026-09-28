import { NextResponse } from 'next/server';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Ensure table exists (fail-safe if register hasn't been called yet)
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS stations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          short_name TEXT,
          station_type TEXT NOT NULL,
          is_public INTEGER NOT NULL DEFAULT 1,
          whatsapp_number TEXT,
          admin_pin TEXT NOT NULL,
          station_token TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'offline',
          last_heartbeat DATETIME,
          duplex_enabled INTEGER NOT NULL DEFAULT 1,
          razorpay_route_split TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await executeD1(createTableSql);

    // Fetch all public stations
    const rows = await queryD1(`
      SELECT 
        id, 
        name, 
        short_name as shortName, 
        station_type as type, 
        status, 
        last_heartbeat, 
        duplex_enabled as duplexEnabled
      FROM stations 
      WHERE is_public = 1
      ORDER BY created_at ASC
    `);

    // Process rows to determine accurate online/offline status based on last_heartbeat
    const stations = rows.map((row: any) => {
      let isOnline = false;
      let offlineMinutes = 0;

      if (row.last_heartbeat) {
        // Parse UTC datetime string to Date object
        const heartbeatTime = new Date(row.last_heartbeat + 'Z').getTime();
        const now = Date.now();
        const diffSeconds = Math.floor((now - heartbeatTime) / 1000);
        
        // If we heard from them in the last 60 seconds, they are online
        if (diffSeconds < 60) {
          isOnline = true;
        } else {
          offlineMinutes = Math.floor(diffSeconds / 60);
        }
      }

      return {
        id: row.id,
        name: row.name,
        shortName: row.shortName,
        type: row.type,
        status: isOnline ? 'online' : 'offline',
        offlineText: isOnline ? null : (offlineMinutes > 0 ? `Offline for ${offlineMinutes} min` : 'Offline'),
        duplexEnabled: row.duplexEnabled === 1
      };
    });

    return NextResponse.json({ success: true, stations });

  } catch (err: any) {
    console.error('Failed to list stations:', err);
    return NextResponse.json({ error: 'Failed to fetch stations' }, { status: 500 });
  }
}
