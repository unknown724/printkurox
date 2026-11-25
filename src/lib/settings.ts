import { queryD1, executeD1 } from '@/lib/cloudflare-d1';

export interface AppSettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface DossierPhoneEntry {
  phone: string;
  note?: string;
  addedAt: string;
}

export interface DossierAccessLists {
  unlimited: DossierPhoneEntry[];
  banned: DossierPhoneEntry[];
}

export interface WhatsAppBotControlConfig {
  botEnabled: boolean;
  printingEnabled: boolean;
  studentSearchEnabled: boolean;
  facultySearchEnabled: boolean;
  aiChatEnabled: boolean;
  /** Default: 'reply_print_only' (reply only to print attempts when master is off; silent for everything else) */
  masterOffBehavior: 'reply_print_only' | 'silent';
  /** Per-module behavior when individually turned off while master is ON */
  nonPrintOffBehavior: 'silent' | 'reply';
  replyCooldownSec: number;
  messages: {
    botOff: string;
    printingOff: string;
    studentOff: string;
    facultyOff: string;
    aiOff: string;
  };
  updatedAt: string;
}

export const DEFAULT_WHATSAPP_BOT_CONFIG: WhatsAppBotControlConfig = {
  botEnabled: true,
  printingEnabled: true,
  studentSearchEnabled: true,
  facultySearchEnabled: true,
  aiChatEnabled: true,
  masterOffBehavior: 'reply_print_only',
  nonPrintOffBehavior: 'silent',
  replyCooldownSec: 60,
  messages: {
    botOff:
      '🖨️ *PrintKurox WhatsApp Bot is currently OFF* for maintenance.\n\nPlease use our web kiosk at https://printkurox.pages.dev or try again shortly.',
    printingOff:
      '🖨️ *WhatsApp Printing is currently paused.* Please print directly via https://printkurox.pages.dev or check back soon.',
    studentOff:
      '🎓 Student directory lookup is currently paused by the administrator.',
    facultyOff:
      '🏫 Faculty directory lookup is currently paused by the administrator.',
    aiOff:
      '🤖 AI assistant is currently paused by the administrator.',
  },
  updatedAt: '',
};

export interface PiSystemTelemetry {
  device_model?: string;
  station_id?: string;
  cpu_temp_c?: number | null;
  undervoltage_now?: boolean;
  undervoltage_occurred?: boolean;
  throttled_now?: boolean;
  battery_pct?: number | null;
  power_source?: string;
  disk_total_gb?: number | null;
  disk_used_gb?: number | null;
  disk_free_gb?: number | null;
  disk_used_pct?: number | null;
  ram_total_mb?: number | null;
  ram_used_mb?: number | null;
  ram_used_pct?: number | null;
  swap_total_mb?: number | null;
  swap_used_mb?: number | null;
  cpu_load_1m?: number | null;
  uptime_sec?: number | null;
  wifi_ssid?: string | null;
  wifi_signal_dbm?: number | null;
  updated_at?: string;
}

let cachedHostelChange: boolean | null = null;

async function ensureSettingsTable(): Promise<void> {
  try {
    await executeD1(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  } catch (err) {
    console.warn('Failed ensuring app_settings table in D1:', err);
  }
}

export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const rows = await queryD1<AppSettingRow>(
      `SELECT key, value, updated_at FROM app_settings WHERE key = ? LIMIT 1`,
      [key]
    );
    return rows?.[0]?.value ?? null;
  } catch {
    await ensureSettingsTable();
    return null;
  }
}

export async function setAppSetting(key: string, value: string): Promise<boolean> {
  try {
    await ensureSettingsTable();
    return await executeD1(
      `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, value]
    );
  } catch (err) {
    console.error(`Error saving app_setting ${key} in D1:`, err);
    return false;
  }
}

export async function getHostelChangeSetting(): Promise<boolean> {
  try {
    const raw = await getAppSetting('hostel_change_enabled');
    if (raw !== null) {
      const val = raw === 'true';
      cachedHostelChange = val;
      return val;
    }
    return cachedHostelChange ?? false;
  } catch (err) {
    console.warn('Could not query hostel_change_enabled from D1, using fallback:', err);
    return cachedHostelChange ?? false;
  }
}

export async function setHostelChangeSetting(enabled: boolean): Promise<boolean> {
  const strVal = enabled ? 'true' : 'false';
  cachedHostelChange = enabled;
  return await setAppSetting('hostel_change_enabled', strVal);
}

export function normalizePhone10(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '').slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export async function getDossierAccessLists(): Promise<DossierAccessLists> {
  const raw = await getAppSetting('dossier_access_lists');
  if (!raw) return { unlimited: [], banned: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<DossierAccessLists>;
    return {
      unlimited: Array.isArray(parsed.unlimited) ? parsed.unlimited : [],
      banned: Array.isArray(parsed.banned) ? parsed.banned : [],
    };
  } catch {
    return { unlimited: [], banned: [] };
  }
}

export async function saveDossierAccessLists(lists: DossierAccessLists): Promise<boolean> {
  return await setAppSetting('dossier_access_lists', JSON.stringify(lists));
}

export function normalizeWhatsAppBotConfig(
  raw?: Partial<WhatsAppBotControlConfig> | null
): WhatsAppBotControlConfig {
  const def = DEFAULT_WHATSAPP_BOT_CONFIG;
  const msgs = raw?.messages || ({} as Partial<WhatsAppBotControlConfig['messages']>);
  return {
    botEnabled: raw?.botEnabled !== undefined ? Boolean(raw.botEnabled) : def.botEnabled,
    printingEnabled: raw?.printingEnabled !== undefined ? Boolean(raw.printingEnabled) : def.printingEnabled,
    studentSearchEnabled:
      raw?.studentSearchEnabled !== undefined ? Boolean(raw.studentSearchEnabled) : def.studentSearchEnabled,
    facultySearchEnabled:
      raw?.facultySearchEnabled !== undefined ? Boolean(raw.facultySearchEnabled) : def.facultySearchEnabled,
    aiChatEnabled: raw?.aiChatEnabled !== undefined ? Boolean(raw.aiChatEnabled) : def.aiChatEnabled,
    masterOffBehavior:
      raw?.masterOffBehavior === 'silent' ? 'silent' : 'reply_print_only',
    nonPrintOffBehavior:
      raw?.nonPrintOffBehavior === 'reply' ? 'reply' : 'silent',
    replyCooldownSec:
      typeof raw?.replyCooldownSec === 'number' && raw.replyCooldownSec >= 10 && raw.replyCooldownSec <= 3600
        ? Math.round(raw.replyCooldownSec)
        : def.replyCooldownSec,
    messages: {
      botOff:
        typeof msgs.botOff === 'string' && msgs.botOff.trim()
          ? msgs.botOff.trim().slice(0, 800)
          : def.messages.botOff,
      printingOff:
        typeof msgs.printingOff === 'string' && msgs.printingOff.trim()
          ? msgs.printingOff.trim().slice(0, 800)
          : def.messages.printingOff,
      studentOff:
        typeof msgs.studentOff === 'string' && msgs.studentOff.trim()
          ? msgs.studentOff.trim().slice(0, 500)
          : def.messages.studentOff,
      facultyOff:
        typeof msgs.facultyOff === 'string' && msgs.facultyOff.trim()
          ? msgs.facultyOff.trim().slice(0, 500)
          : def.messages.facultyOff,
      aiOff:
        typeof msgs.aiOff === 'string' && msgs.aiOff.trim()
          ? msgs.aiOff.trim().slice(0, 500)
          : def.messages.aiOff,
    },
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : '',
  };
}

export async function getWhatsAppBotConfig(): Promise<WhatsAppBotControlConfig> {
  const raw = await getAppSetting('whatsapp_bot_config');
  if (!raw) return DEFAULT_WHATSAPP_BOT_CONFIG;
  try {
    return normalizeWhatsAppBotConfig(JSON.parse(raw) as Partial<WhatsAppBotControlConfig>);
  } catch {
    return DEFAULT_WHATSAPP_BOT_CONFIG;
  }
}

export async function saveWhatsAppBotConfig(
  cfg: Partial<WhatsAppBotControlConfig>
): Promise<WhatsAppBotControlConfig | null> {
  const current = await getWhatsAppBotConfig();
  const next = normalizeWhatsAppBotConfig({
    ...current,
    ...cfg,
    messages: {
      ...current.messages,
      ...(cfg.messages || {}),
    },
    updatedAt: new Date().toISOString(),
  });
  const ok = await setAppSetting('whatsapp_bot_config', JSON.stringify(next));
  return ok ? next : null;
}

export async function getPiTelemetry(stationId = 'block_b'): Promise<PiSystemTelemetry | null> {
  const raw = await getAppSetting(`pi_telemetry_${stationId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PiSystemTelemetry;
  } catch {
    return null;
  }
}
