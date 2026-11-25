import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, validateAdminPin, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import {
  getHostelChangeSetting,
  setHostelChangeSetting,
  getDossierAccessLists,
  saveDossierAccessLists,
  getWhatsAppBotConfig,
  saveWhatsAppBotConfig,
  normalizePhone10,
} from '@/lib/settings';

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

    const [hostelChangeEnabled, dossierAccess, whatsappBotConfig] = await Promise.all([
      getHostelChangeSetting(),
      getDossierAccessLists(),
      getWhatsAppBotConfig(),
    ]);

    return NextResponse.json({
      success: true,
      hostelChangeEnabled,
      dossierAccess,
      whatsappBotConfig,
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
    const { hostelChangeEnabled, pin, action, phone, note, whatsappBotConfig } = body;

    const pinValid = pin && validateAdminPin(pin);
    if (!isAuth && !pinValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // WhatsApp Bot Master / Mode Toggles & Custom Auto-Replies
    if (action === 'update_whatsapp_config') {
      if (!whatsappBotConfig || typeof whatsappBotConfig !== 'object') {
        return NextResponse.json({ error: 'Invalid whatsappBotConfig payload' }, { status: 400 });
      }
      const savedConfig = await saveWhatsAppBotConfig(whatsappBotConfig);
      if (!savedConfig) {
        return NextResponse.json({ error: 'Failed to save WhatsApp bot config' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        whatsappBotConfig: savedConfig,
      });
    }

    // Dossier VIP / Ban management actions
    if (typeof action === 'string') {
      const cleanPhone = normalizePhone10(String(phone || ''));
      if (!cleanPhone) {
        return NextResponse.json(
          { error: 'Enter a valid 10-digit Indian WhatsApp mobile number' },
          { status: 400 }
        );
      }

      const lists = await getDossierAccessLists();
      const nowIso = new Date().toISOString();
      const cleanNote = typeof note === 'string' ? note.trim().slice(0, 60) : '';

      if (action === 'add_unlimited') {
        lists.banned = lists.banned.filter((b) => b.phone !== cleanPhone);
        lists.unlimited = [
          { phone: cleanPhone, note: cleanNote || 'Permanent VIP', addedAt: nowIso },
          ...lists.unlimited.filter((u) => u.phone !== cleanPhone),
        ];
      } else if (action === 'remove_unlimited') {
        lists.unlimited = lists.unlimited.filter((u) => u.phone !== cleanPhone);
      } else if (action === 'ban_phone') {
        lists.unlimited = lists.unlimited.filter((u) => u.phone !== cleanPhone);
        lists.banned = [
          { phone: cleanPhone, note: cleanNote || 'Banned by Admin', addedAt: nowIso },
          ...lists.banned.filter((b) => b.phone !== cleanPhone),
        ];
      } else if (action === 'unban_phone') {
        lists.banned = lists.banned.filter((b) => b.phone !== cleanPhone);
      } else {
        return NextResponse.json({ error: 'Unknown dossier access action' }, { status: 400 });
      }

      const saved = await saveDossierAccessLists(lists);
      return NextResponse.json({
        success: saved,
        dossierAccess: lists,
      });
    }

    // Hostel station switching toggle
    if (typeof hostelChangeEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid payload: hostelChangeEnabled boolean or dossier action required' },
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
