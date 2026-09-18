import { queryD1, executeD1 } from '@/lib/cloudflare-d1';

export interface AppSettingRow {
  key: string;
  value: string;
  updated_at: string;
}

let cachedHostelChange: boolean | null = null;

/**
 * Ensures the app_settings table exists in Cloudflare D1.
 */
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

/**
 * Retrieves the current status of hostel change for printers.
 * Defaults to false (hidden from UI) if not explicitly set.
 */
export async function getHostelChangeSetting(): Promise<boolean> {
  try {
    let rows: AppSettingRow[] = [];
    try {
      rows = await queryD1<AppSettingRow>(
        `SELECT key, value, updated_at FROM app_settings WHERE key = 'hostel_change_enabled' LIMIT 1`
      );
    } catch {
      await ensureSettingsTable();
      rows = await queryD1<AppSettingRow>(
        `SELECT key, value, updated_at FROM app_settings WHERE key = 'hostel_change_enabled' LIMIT 1`
      );
    }

    if (rows && rows.length > 0) {
      const val = rows[0].value === 'true';
      cachedHostelChange = val;
      return val;
    }

    return cachedHostelChange ?? false;
  } catch (err) {
    console.warn('Could not query hostel_change_enabled from D1, using fallback:', err);
    return cachedHostelChange ?? false;
  }
}

/**
 * Updates the hostel change setting in Cloudflare D1 and internal cache.
 */
export async function setHostelChangeSetting(enabled: boolean): Promise<boolean> {
  const strVal = enabled ? 'true' : 'false';
  cachedHostelChange = enabled;

  try {
    await ensureSettingsTable();
    const success = await executeD1(
      `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('hostel_change_enabled', ?, datetime('now'))`,
      [strVal]
    );
    return success;
  } catch (err) {
    console.error('Error saving hostel_change_enabled in D1:', err);
    // Still cached in memory for runtime
    return false;
  }
}
