import { NextRequest, NextResponse } from 'next/server';
import { getStationConfig, validateStationPinWithRole, validateStationPin } from '@/lib/stations';
import {
  verifyAdminDevice,
  ADMIN_COOKIE_NAME,
  STATION_SESSION_COOKIE,
  createStationSession,
  verifyStationSession,
  recordAuditLog,
} from '@/lib/admin-auth';
import { checkRateLimit, recordFailedAttempt, resetFailedAttempts } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stationParam = searchParams.get('station_id') || searchParams.get('station') || 'block_b';
  const station = getStationConfig(stationParam);

  // 1. Check master admin device token
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

  // 2. Check cryptographically signed HMAC session cookie
  const sessionToken = req.cookies.get(STATION_SESSION_COOKIE)?.value;
  if (sessionToken) {
    const session = verifyStationSession(sessionToken);
    if (session) {
      if (session.role === 'master_admin') {
        return NextResponse.json({
          isStationAdmin: true,
          isMasterAdmin: true,
          station,
        });
      }

      // Strict IDOR barrier: Co-admin session must match requested station!
      if (session.stationId === station.id) {
        return NextResponse.json({
          isStationAdmin: true,
          isMasterAdmin: false,
          station,
        });
      } else {
        // Log cross-station probe
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
        await recordAuditLog({
          station_id: session.stationId,
          actor_role: 'coadmin',
          action_type: 'CROSS_STATION_ACCESS_BLOCKED',
          target_id: station.id,
          details: `Coadmin from ${session.stationId} attempted to access ${station.id}`,
          ip_address: ip,
        });
      }
    }
  }

  // 3. Fallback compatibility for legacy session (if present)
  const legacyPin = req.cookies.get('station_admin_pin')?.value;
  if (legacyPin && validateStationPin(station.id, legacyPin)) {
    return NextResponse.json({
      isStationAdmin: true,
      isMasterAdmin: false,
      station,
    });
  }

  return NextResponse.json({
    isStationAdmin: false,
    isMasterAdmin: false,
    station,
  });
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'Unknown';

    // 1. Check rate limit
    const rateCheck = await checkRateLimit(ip);
    if (!rateCheck.allowed) {
      await recordAuditLog({
        actor_role: 'system',
        action_type: 'IP_LOCKED_OUT',
        details: rateCheck.message,
        ip_address: ip,
        user_agent: userAgent,
      });

      return NextResponse.json(
        { error: rateCheck.message },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfterSeconds || 900) },
        }
      );
    }

    const { station_id: rawStationId, pin, rememberDevice } = await req.json();
    const station = getStationConfig(rawStationId || 'block_b');

    // 2. Validate PIN with role detection
    const authResult = validateStationPinWithRole(station.id, pin);

    if (!pin || !authResult.isValid) {
      const failResult = await recordFailedAttempt(ip);
      const status = failResult.locked ? 429 : 401;

      await recordAuditLog({
        station_id: station.id,
        actor_role: 'coadmin',
        action_type: 'FAILED_LOGIN_ATTEMPT',
        details: `Failed PIN attempt for station ${station.name}. Remaining: ${failResult.remainingAttempts}`,
        ip_address: ip,
        user_agent: userAgent,
      });

      return NextResponse.json({ error: failResult.message }, { status });
    }

    // 3. Reset rate limit on success
    await resetFailedAttempts(ip);

    // 4. Issue Cryptographically Signed HMAC Session Token
    const role = authResult.isMaster ? 'master_admin' : 'coadmin';
    const maxDays = rememberDevice ? 365 : 30;
    const sessionToken = createStationSession(station.id, role, maxDays);

    await recordAuditLog({
      station_id: station.id,
      actor_role: role,
      action_type: 'STATION_LOGIN_SUCCESS',
      details: `Authenticated as ${role} for ${station.name} (${station.operatorName})`,
      ip_address: ip,
      user_agent: userAgent,
    });

    const res = NextResponse.json({
      success: true,
      station,
      isMaster: authResult.isMaster,
      message: `Authenticated as ${station.operatorName} (${station.name})`,
    });

    const maxAgeSeconds = maxDays * 24 * 60 * 60;
    const isProd = process.env.NODE_ENV === 'production';

    // Set signed session cookie (HttpOnly, Secure in prod, SameSite=Lax for navigation)
    res.cookies.set(STATION_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds,
    });

    // Delete legacy plaintext cookie if present
    res.cookies.delete('station_admin_pin');

    return res;
  } catch (err: unknown) {
    console.error('Station auth error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, message: 'Logged out' });
  res.cookies.delete(STATION_SESSION_COOKIE);
  res.cookies.delete('station_admin_pin');
  return res;
}
