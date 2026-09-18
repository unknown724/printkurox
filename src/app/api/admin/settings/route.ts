import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, validateAdminPin, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import { getHostelChangeSetting, setHostelChangeSetting } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAuthorizedAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (token && (await verifyAdminToken(token))) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const isAuth = await isAuthorizedAdmin(req);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hostelChangeEnabled = await getHostelChangeSetting();
    return NextResponse.json({
      success: true,
      hostelChangeEnabled,
    });
  } catch (err) {
    console.error('Error fetching admin settings:', err);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuth = await isAuthorizedAdmin(req);

    const body = await req.json().catch(() => ({}));
    const { hostelChangeEnabled, pin } = body;

    // Check auth via cookie or via direct PIN verification
    const pinValid = pin && validateAdminPin(pin);
    if (!isAuth && !pinValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (typeof hostelChangeEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid payload: hostelChangeEnabled boolean is required' },
        { status: 400 }
      );
    }

    const success = await setHostelChangeSetting(hostelChangeEnabled);

    return NextResponse.json({
      success,
      hostelChangeEnabled,
      message: hostelChangeEnabled
        ? 'Hostel station change enabled'
        : 'Hostel station change disabled and hidden from UI',
    });
  } catch (err) {
    console.error('Error updating admin settings:', err);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
