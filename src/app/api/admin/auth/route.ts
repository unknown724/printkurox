import { NextRequest, NextResponse } from 'next/server';
import { validateAdminPin, createAdminToken, verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const isAdmin = Boolean(token && verifyAdminToken(token));
  return NextResponse.json({ isAdmin });
}

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();

    if (!validateAdminPin(pin)) {
      return NextResponse.json({ error: 'Invalid admin passcode' }, { status: 401 });
    }

    const token = createAdminToken();
    const res = NextResponse.json({
      success: true,
      message: 'Device authorized as Admin for 30 days',
    });

    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return res;
  } catch (err) {
    console.error('Admin login error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, message: 'Logged out of admin' });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
