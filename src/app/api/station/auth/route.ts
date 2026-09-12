import { NextRequest, NextResponse } from 'next/server';
import { getStationConfig, validateStationPin } from '@/lib/stations';
import { verifyAdminDevice, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stationParam = searchParams.get('station_id') || searchParams.get('station') || 'romen_xerox';
  const station = getStationConfig(stationParam);

  // Check master admin
  const masterToken = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (masterToken) {
    const { isValid } = await verifyAdminDevice(masterToken);
    if (isValid) {
      return NextResponse.json({
        isStationAdmin: true,
        isMasterAdmin: true,
        station,
      });
    }
  }

  // Check station PIN cookie
  const pinCookie = req.cookies.get('station_admin_pin')?.value;
  if (pinCookie && validateStationPin(station.id, pinCookie)) {
    return NextResponse.json({
      isStationAdmin: true,
      isMasterAdmin: false,
      station,
    });
  }

  return NextResponse.json({
    isStationAdmin: false,
    station,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { station_id: rawStationId, pin, rememberDevice } = await req.json();
    const station = getStationConfig(rawStationId || 'romen_xerox');

    if (!pin || !validateStationPin(station.id, pin)) {
      return NextResponse.json({ error: 'Invalid station passcode' }, { status: 401 });
    }

    const res = NextResponse.json({
      success: true,
      station,
      message: `Authenticated as ${station.operatorName} (${station.name})`,
    });

    // Store in cookie for 365 days if rememberDevice, else 30 days
    const maxAgeSeconds = rememberDevice ? 365 * 24 * 60 * 60 : 30 * 24 * 60 * 60;
    res.cookies.set('station_admin_pin', pin.trim(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds,
    });

    return res;
  } catch (err: unknown) {
    console.error('Station auth error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, message: 'Logged out' });
  res.cookies.delete('station_admin_pin');
  return res;
}
