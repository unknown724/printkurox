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

export async function getPiTelemetry(stationId = 'block_b'): Promise<PiSystemTelemetry | null> {
  const raw = await getAppSetting(`pi_telemetry_${stationId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PiSystemTelemetry;
  } catch {
    return null;
  }
}
