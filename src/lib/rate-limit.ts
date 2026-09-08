import { queryD1, executeD1 } from '@/lib/cloudflare-d1';

interface RateLimitRecord {
  ip: string;
  failed_count: number;
  last_attempt_at: string;
  locked_until: string | null;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Checks if the given IP address is currently locked out from attempting admin authentication.
 */
export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSeconds?: number; message?: string }> {
  if (!ip) return { allowed: true };

  try {
    const rows = await queryD1<RateLimitRecord>(
      `SELECT ip, failed_count, last_attempt_at, locked_until 
       FROM auth_rate_limits 
       WHERE ip = ? 
       LIMIT 1`,
      [ip]
    );

    if (rows.length === 0) {
      return { allowed: true };
    }

    const record = rows[0];
    if (record.locked_until) {
      const lockExpiry = new Date(record.locked_until).getTime();
      const now = Date.now();

      if (lockExpiry > now) {
        const remainingSeconds = Math.ceil((lockExpiry - now) / 1000);
        const remainingMinutes = Math.ceil(remainingSeconds / 60);
        return {
          allowed: false,
          retryAfterSeconds: remainingSeconds,
          message: `Too many failed passcode attempts. Account locked. Please try again in ${remainingMinutes} minute(s).`,
        };
      }
    }

    return { allowed: true };
  } catch (err) {
    console.error('Rate limit check error:', err);
    // Fail open in case of network glitch so legitimate admin is not blocked by DB error
    return { allowed: true };
  }
}

/**
 * Records a failed passcode attempt for the IP. Locks IP for 15 minutes upon 5 failed attempts.
 */
export async function recordFailedAttempt(ip: string): Promise<{ locked: boolean; remainingAttempts: number; message: string }> {
  if (!ip) return { locked: false, remainingAttempts: MAX_ATTEMPTS - 1, message: 'Invalid attempt' };

  try {
    const rows = await queryD1<RateLimitRecord>(
      `SELECT ip, failed_count, locked_until 
       FROM auth_rate_limits 
       WHERE ip = ? 
       LIMIT 1`,
      [ip]
    );

    const now = new Date();
    const nowIso = now.toISOString();

    if (rows.length === 0) {
      await executeD1(
        `INSERT INTO auth_rate_limits (ip, failed_count, last_attempt_at, locked_until)
         VALUES (?, 1, ?, NULL)`,
        [ip, nowIso]
      );
      return {
        locked: false,
        remainingAttempts: MAX_ATTEMPTS - 1,
        message: `Invalid passcode. ${MAX_ATTEMPTS - 1} attempt(s) remaining before lockout.`,
      };
    }

    const currentRecord = rows[0];
    const newCount = (currentRecord.failed_count || 0) + 1;

    if (newCount >= MAX_ATTEMPTS) {
      const lockUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
      await executeD1(
        `UPDATE auth_rate_limits 
         SET failed_count = ?, last_attempt_at = ?, locked_until = ?
         WHERE ip = ?`,
        [newCount, nowIso, lockUntil, ip]
      );
      return {
        locked: true,
        remainingAttempts: 0,
        message: `Too many failed passcode attempts. IP locked out for ${LOCKOUT_MINUTES} minutes.`,
      };
    } else {
      await executeD1(
        `UPDATE auth_rate_limits 
         SET failed_count = ?, last_attempt_at = ?
         WHERE ip = ?`,
        [newCount, nowIso, ip]
      );
      return {
        locked: false,
        remainingAttempts: MAX_ATTEMPTS - newCount,
        message: `Invalid passcode. ${MAX_ATTEMPTS - newCount} attempt(s) remaining before lockout.`,
      };
    }
  } catch (err) {
    console.error('Record failed attempt error:', err);
    return { locked: false, remainingAttempts: 1, message: 'Invalid passcode' };
  }
}

/**
 * Resets the failed attempts on successful passcode entry.
 */
export async function resetFailedAttempts(ip: string): Promise<void> {
  if (!ip) return;
  try {
    await executeD1(`DELETE FROM auth_rate_limits WHERE ip = ?`, [ip]);
  } catch (err) {
    console.error('Reset failed attempts error:', err);
  }
}
