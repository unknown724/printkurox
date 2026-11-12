import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, validateAdminPin, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import { executeD1, queryD1 } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAuthorizedAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (token && (await verifyAdminToken(token))) {
    return true;
  }
  const authHeader = req.headers.get('authorization')?.replace('Bearer ', '');
  if (authHeader && (await verifyAdminToken(authHeader))) {
    return true;
  }
  return false;
}

interface HardwareDeviceRow {
  serial_key: string;
  status: string;
  batch_number: string | null;
  claimed_station_id: string | null;
  claimed_at: string | null;
  created_at: string;
}

// GET /api/admin/hardware-inventory
export async function GET(req: NextRequest) {
  try {
    const isAuth = await isAuthorizedAdmin(req);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const devices = await queryD1<HardwareDeviceRow>(
      `SELECT serial_key, status, batch_number, claimed_station_id, claimed_at, created_at 
       FROM hardware_devices 
       ORDER BY created_at DESC`
    );

    return NextResponse.json({
      success: true,
      count: devices.length,
      devices,
    });
  } catch (err: unknown) {
    console.error('Error fetching hardware inventory:', err);
    return NextResponse.json({ error: 'Failed to fetch hardware devices' }, { status: 500 });
  }
}

// POST /api/admin/hardware-inventory
// Generates a batch of new hardware keys
export async function POST(req: NextRequest) {
  try {
    const isAuth = await isAuthorizedAdmin(req);
    const body = await req.json().catch(() => ({}));
    const { pin, batchName = 'BATCH-02', count = 10, prefix = 'KUROX-PRO' } = body;

    const pinValid = pin && validateAdminPin(pin);
    if (!isAuth && !pinValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestedCount = Math.min(Math.max(Number(count) || 1, 1), 50);
    const generatedKeys: string[] = [];

    // Find highest serial index
    const existing = await queryD1<{ serial_key: string }>(
      `SELECT serial_key FROM hardware_devices WHERE serial_key LIKE ?`,
      [`${prefix}-%`]
    );

    let maxNum = 8820;
    for (const row of existing) {
      const match = row.serial_key.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    for (let i = 1; i <= requestedCount; i++) {
      const nextNum = maxNum + i;
      const key = `${prefix}-${nextNum}`;
      await executeD1(
        `INSERT OR IGNORE INTO hardware_devices (serial_key, batch_number, status) VALUES (?, ?, 'unclaimed')`,
        [key, batchName]
      );
      generatedKeys.push(key);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully provisioned ${generatedKeys.length} new hardware device keys for ${batchName}`,
      generatedKeys,
    });
  } catch (err: unknown) {
    console.error('Error creating hardware keys:', err);
    return NextResponse.json({ error: 'Failed to provision hardware keys' }, { status: 500 });
  }
}
