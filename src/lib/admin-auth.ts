import crypto from 'crypto';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || 'Kurox725#29';
export const ADMIN_COOKIE_NAME = 'printkurox_admin_device_id';
export const MAX_ADMIN_DEVICES = 3;

export interface AdminDevice {
  device_id: string;
  device_name: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active: string;
}

/**
 * Validates admin passcode using timing-safe comparison.
 */
export function validateAdminPin(inputPin: string): boolean {
  if (!inputPin || typeof inputPin !== 'string') return false;
  const inputBuffer = Buffer.from(inputPin.trim());
  const secretBuffer = Buffer.from(ADMIN_SECRET.trim());

  if (inputBuffer.length !== secretBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(inputBuffer, secretBuffer);
}

/**
 * Lists all currently authorized admin devices from D1.
 */
export async function getAdminDevices(): Promise<AdminDevice[]> {
  try {
    return await queryD1<AdminDevice>(
      `SELECT device_id, device_name, ip_address, user_agent, created_at, last_active
       FROM admin_devices
       ORDER BY last_active DESC`
    );
  } catch (err) {
    console.error('Failed to get admin devices:', err);
    return [];
  }
}

/**
 * Registers a new device if under the 3-device limit.
 */
export async function registerAdminDevice(
  deviceName: string,
  userAgent: string,
  ipAddress: string
): Promise<{ success: boolean; deviceId?: string; error?: string }> {
  const devices = await getAdminDevices();

  if (devices.length >= MAX_ADMIN_DEVICES) {
    return {
      success: false,
      error: `Maximum ${MAX_ADMIN_DEVICES} devices reached. Please disconnect an existing device first.`,
    };
  }

  const deviceId = crypto.randomUUID();
  const now = new Date().toISOString();

  await executeD1(
    `INSERT INTO admin_devices (device_id, device_name, ip_address, user_agent, created_at, last_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [deviceId, deviceName || 'Authorized Device', ipAddress || 'Unknown', userAgent || 'Unknown', now, now]
  );

  return { success: true, deviceId };
}

/**
 * Revokes an authorized device.
 */
export async function revokeAdminDevice(deviceId: string): Promise<boolean> {
  try {
    await executeD1(`DELETE FROM admin_devices WHERE device_id = ?`, [deviceId]);
    return true;
  } catch (err) {
    console.error('Failed to revoke device:', err);
    return false;
  }
}

/**
 * Verifies if a given device_id is currently authorized in D1.
 */
export async function verifyAdminDevice(deviceId: string): Promise<{ isValid: boolean; device?: AdminDevice }> {
  if (!deviceId || typeof deviceId !== 'string') return { isValid: false };

  try {
    const rows = await queryD1<AdminDevice>(
      `SELECT device_id, device_name, ip_address, user_agent, created_at, last_active
       FROM admin_devices
       WHERE device_id = ?
       LIMIT 1`,
      [deviceId]
    );

    if (rows.length === 0) return { isValid: false };

    // Update last_active timestamp
    const now = new Date().toISOString();
    await executeD1(`UPDATE admin_devices SET last_active = ? WHERE device_id = ?`, [now, deviceId]);

    return { isValid: true, device: rows[0] };
  } catch (err) {
    console.error('Error verifying admin device:', err);
    return { isValid: false };
  }
}

/**
 * Backward-compatible helper for verifying admin token/device
 */
export async function verifyAdminToken(deviceId: string): Promise<boolean> {
  const { isValid } = await verifyAdminDevice(deviceId);
  return isValid;
}

