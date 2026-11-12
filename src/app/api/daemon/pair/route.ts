import { NextRequest, NextResponse } from 'next/server';
import { executeD1, queryD1 } from '@/lib/cloudflare-d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HardwareDeviceRow {
  serial_key: string;
  status: string;
  claimed_station_id: string | null;
  batch_number: string | null;
}

interface StationRow {
  id: string;
  name: string;
  token: string;
  pin_hash?: string;
  whatsapp_number?: string;
}

// GET /api/daemon/pair?serialKey=KUROX-PRO-8821
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const serialKey = (searchParams.get('serialKey') || '').trim().toUpperCase();

    if (!serialKey) {
      return NextResponse.json({ error: 'Missing serialKey parameter' }, { status: 400 });
    }

    // 1. Check if hardware device exists in inventory
    const devices = await queryD1<HardwareDeviceRow>(
      `SELECT serial_key, status, claimed_station_id, batch_number FROM hardware_devices WHERE UPPER(serial_key) = ? LIMIT 1`,
      [serialKey]
    );

    if (!devices || devices.length === 0) {
      return NextResponse.json(
        { paired: false, error: 'Unrecognized hardware device serial number.' },
        { status: 404 }
      );
    }

    const device = devices[0];

    // 2. Check if hardware has been claimed by the operator on /setup
    if (device.status !== 'claimed' || !device.claimed_station_id) {
      return NextResponse.json({
        paired: false,
        status: device.status,
        serialKey: device.serial_key,
        message: 'Awaiting operator activation on https://printkurox.vercel.app/setup',
      });
    }

    // 3. Fetch station token and details for this claimed station
    const stations = await queryD1<StationRow>(
      `SELECT id, name, token, pin_hash, whatsapp_number FROM stations WHERE id = ? LIMIT 1`,
      [device.claimed_station_id]
    );

    if (!stations || stations.length === 0) {
      return NextResponse.json({
        paired: false,
        error: `Station record ${device.claimed_station_id} not found. Please contact support.`,
      }, { status: 500 });
    }

    const station = stations[0];

    // Return credentials to the daemon so it can auto-configure its local station_config.json
    return NextResponse.json({
      paired: true,
      serialKey: device.serial_key,
      station_id: station.id,
      station_name: station.name,
      station_token: station.token,
      cloud_url: process.env.NEXT_PUBLIC_APP_URL || 'https://printkurox.vercel.app',
      message: `Successfully paired to station "${station.name}" (${station.id})!`,
    });
  } catch (err: unknown) {
    console.error('Daemon pairing check error:', err);
    return NextResponse.json({ error: 'Failed to query device pairing state' }, { status: 500 });
  }
}

