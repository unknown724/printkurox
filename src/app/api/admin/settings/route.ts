import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminToken,
  validateAdminPin,
  ADMIN_COOKIE_NAME,
  WHATSAPP_OWNER_COOKIE,
  validateWhatsAppOwnerPassword,
  createWhatsAppOwnerToken,
  verifyWhatsAppOwnerToken,
  recordAuditLog,
} from '@/lib/admin-auth';
import {
  checkRateLimit,
  recordFailedAttempt,
  resetFailedAttempts,
  getClientIp,
} from '@/lib/rate-limit';
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

function isWhatsAppOwnerUnlocked(req: NextRequest): boolean {
  const cookieVal = req.cookies.get(WHATSAPP_OWNER_COOKIE)?.value;
  return verifyWhatsAppOwnerToken(cookieVal);
}

export async function GET(req: NextRequest) {
  try {
    const isAuth = await isAuthorizedAdmin(req);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const whatsappUnlocked = isWhatsAppOwnerUnlocked(req);
    const hostelChangeEnabled = await getHostelChangeSetting();

    if (!whatsappUnlocked) {
      return NextResponse.json({
        success: true,
        hostelChangeEnabled,
        whatsappUnlocked: false,
      });
    }

    const [dossierAccess, whatsappBotConfig] = await Promise.all([
      getDossierAccessLists(),
      getWhatsAppBotConfig(),
    ]);

    return NextResponse.json({
      success: true,
      hostelChangeEnabled,
      whatsappUnlocked: true,
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
    const { hostelChangeEnabled, pin, action, phone, note, whatsappBotConfig, waPassword } = body;

    const pinValid = pin && validateAdminPin(pin);
    if (!isAuth && !pinValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Unlock WhatsApp Bot Command Center section (secondary owner password)
    if (action === 'unlock_whatsapp_section') {
      const rateKey = `wa_owner:${getClientIp(req)}`;
      const rateCheck = await checkRateLimit(rateKey);
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: rateCheck.message },
          { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfterSeconds || 900) } }
        );
      }

      if (!validateWhatsAppOwnerPassword(String(waPassword || ''))) {
        const failResult = await recordFailedAttempt(rateKey);
        return NextResponse.json(
          { error: failResult.locked ? failResult.message : `Incorrect WhatsApp owner password. ${failResult.message}` },
          { status: failResult.locked ? 429 : 403 }
        );
      }

      await resetFailedAttempts(rateKey);
      void recordAuditLog({
        actor_role: 'master_admin',
        action_type: 'WA_OWNER_SECTION_UNLOCKED',
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent') || null,
      });

      const [dossierAccess, cfg] = await Promise.all([
        getDossierAccessLists(),
        getWhatsAppBotConfig(),
      ]);

      const res = NextResponse.json({
        success: true,
        whatsappUnlocked: true,
        dossierAccess,
        whatsappBotConfig: cfg,
      });
      res.cookies.set(WHATSAPP_OWNER_COOKIE, createWhatsAppOwnerToken(7200), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 7200,
      });
      return res;
    }

    // Lock WhatsApp Bot Command Center section immediately
    if (action === 'lock_whatsapp_section') {
      const res = NextResponse.json({
        success: true,
        whatsappUnlocked: false,
      });
      res.cookies.set(WHATSAPP_OWNER_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
      return res;
    }

    // All WhatsApp Bot & Dossier VIP/Ban mutations require verified WhatsApp owner unlock
    if (typeof action === 'string') {
      if (!isWhatsAppOwnerUnlocked(req)) {
        return NextResponse.json(
          { error: 'WhatsApp Bot section is locked. Enter owner password first.', locked: true },
          { status: 403 }
        );
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
