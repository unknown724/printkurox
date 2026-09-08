import { NextRequest, NextResponse } from 'next/server';
import {
  validateAdminPin,
  getAdminDevices,
  registerAdminDevice,
  revokeAdminDevice,
  verifyAdminDevice,
  ADMIN_COOKIE_NAME,
  MAX_ADMIN_DEVICES,
} from '@/lib/admin-auth';
import { parseUserAgentDetails } from '@/lib/device-detection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentDeviceId = req.cookies.get(ADMIN_COOKIE_NAME)?.value;

  const { isValid, device } = await verifyAdminDevice(currentDeviceId || '');

  // If requesting the full list of devices (for /adminkurox page)
  if (searchParams.get('action') === 'devices') {
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const devices = await getAdminDevices();
    return NextResponse.json({
      devices,
      currentDeviceId,
      maxDevices: MAX_ADMIN_DEVICES,
    });
  }

  return NextResponse.json({
    isAdmin: isValid,
    deviceName: device?.device_name,
    currentDeviceId,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { pin, customDeviceName } = await req.json();

    if (!validateAdminPin(pin)) {
      return NextResponse.json({ error: 'Invalid admin passcode' }, { status: 401 });
    }

    const ua = req.headers.get('user-agent') || '';
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
    const friendlyName = customDeviceName || parseUserAgentDetails(ua).fullName;

    const currentDeviceId = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (currentDeviceId) {
      const existing = await verifyAdminDevice(currentDeviceId);
      if (existing.isValid) {
        const allDevices = await getAdminDevices();
        return NextResponse.json({
          success: true,
          message: 'Device already authorized',
          deviceId: currentDeviceId,
          devices: allDevices,
          currentDeviceId,
        });
      }
    }

    const regResult = await registerAdminDevice(friendlyName, ua, ip);
    if (!regResult.success || !regResult.deviceId) {
      return NextResponse.json({ error: regResult.error || 'Failed to authorize device' }, { status: 403 });
    }

    const allDevices = await getAdminDevices();

    const res = NextResponse.json({
      success: true,
      message: 'Device permanently authorized',
      deviceId: regResult.deviceId,
      devices: allDevices,
      currentDeviceId: regResult.deviceId,
    });

    // Permanent cookie (10 years, no expiration)
    res.cookies.set(ADMIN_COOKIE_NAME, regResult.deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 315360000, // 10 years (Permanent)
    });

    return res;
  } catch (err) {
    console.error('Admin login error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('deviceId');
    const currentDeviceId = req.cookies.get(ADMIN_COOKIE_NAME)?.value;

    // Hardcore Unremovable Admin Policy:
    // An admin device can ONLY disconnect itself. No admin can kick out another admin!
    if (targetId && targetId !== currentDeviceId) {
      return NextResponse.json(
        { error: 'Forbidden: Admin devices are permanent and cannot be disconnected by other devices.' },
        { status: 403 }
      );
    }

    const deviceIdToRevoke = targetId || currentDeviceId;
    if (deviceIdToRevoke) {
      await revokeAdminDevice(deviceIdToRevoke);
    }

    const res = NextResponse.json({ success: true, message: 'Device disconnected' });
    res.cookies.delete(ADMIN_COOKIE_NAME);
    return res;
  } catch (err) {
    console.error('Error disconnecting device:', err);
    return NextResponse.json({ error: 'Failed to disconnect device' }, { status: 500 });
  }
}
