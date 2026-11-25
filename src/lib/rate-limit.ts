import { NextRequest, NextResponse } from 'next/server';
import { queryD1, executeD1 } from '@/lib/cloudflare-d1';

interface RateLimitRecord {
  ip: string;
  failed_count: number;
  last_attempt_at: string;
  locked_until: string | null;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const LOCKOUT_WINDOW_MS = LOCKOUT_MINUTES * 60 * 1000;

const publicBurstBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Extracts client IP cleanly across Cloudflare Workers and standard proxies.
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

/**
 * Lightweight edge-isolate rate limiter for public upload/order/conversion endpoints.
 * Returns a 429 NextResponse if limit is exceeded, otherwise null.
 */
export function enforcePublicRateLimit(
  req: NextRequest,
  bucket: string,
  maxRequests = 25,
  windowSeconds = 60
): NextResponse | null {
  const ip = getClientIp(req);
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  if (publicBurstBuckets.size > 1000) {
    for (const [k, v] of publicBurstBuckets.entries()) {
      if (v.resetAt <= now) publicBurstBuckets.delete(k);
    }
  }

  const existing = publicBurstBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    publicBurstBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  existing.count += 1;
  if (existing.count > maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return NextResponse.json(
      { error: `Too many requests. Please wait ${retryAfter}s and try again.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }
  return null;
}

/**
 * Checks if the given key/IP is currently locked out from attempting admin authentication.
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
    const now = Date.now();
    if (record.locked_until) {
      const lockExpiry = new Date(record.locked_until).getTime();

      if (lockExpiry > now) {
        const remainingSeconds = Math.ceil((lockExpiry - now) / 1000);
        const remainingMinutes = Math.ceil(remainingSeconds / 60);
        return {
          allowed: false,
          retryAfterSeconds: remainingSeconds,
          message: `Too many failed passcode attempts. Account locked. Please try again in ${remainingMinutes} minute(s).`,
        };
      }

      // Expired lockout: clear stale failed_count so one subsequent typo does not immediately re-lock
      await executeD1(`DELETE FROM auth_rate_limits WHERE ip = ?`, [ip]).catch(() => {});
      return { allowed: true };
    }

    const lastAttemptMs = record.last_attempt_at ? new Date(record.last_attempt_at).getTime() : 0;
    if (lastAttemptMs > 0 && now - lastAttemptMs > LOCKOUT_WINDOW_MS) {
      await executeD1(`DELETE FROM auth_rate_limits WHERE ip = ?`, [ip]).catch(() => {});
    }

    return { allowed: true };
  } catch (err) {
    console.error('Rate limit check error:', err);
    // Fail open in case of network glitch so legitimate admin is not blocked by DB error
    return { allowed: true };
  }
}

/**
 * Records a failed passcode attempt for the key/IP. Locks IP for 15 minutes upon 5 failed attempts.
 */
export async function recordFailedAttempt(ip: string): Promise<{ locked: boolean; remainingAttempts: number; message: string }> {
  if (!ip) return { locked: false, remainingAttempts: MAX_ATTEMPTS - 1, message: 'Invalid attempt' };

  try {
    const rows = await queryD1<RateLimitRecord>(
      `SELECT ip, failed_count, last_attempt_at, locked_until 
       FROM auth_rate_limits 
       WHERE ip = ? 
       LIMIT 1`,
      [ip]
    );

    const now = new Date();
    const nowMs = now.getTime();
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
    const expiredLock = currentRecord.locked_until ? new Date(currentRecord.locked_until).getTime() <= nowMs : false;
    const staleWindow = currentRecord.last_attempt_at
      ? (nowMs - new Date(currentRecord.last_attempt_at).getTime() > LOCKOUT_WINDOW_MS)
      : false;
    const baseCount = (expiredLock || staleWindow) ? 0 : (currentRecord.failed_count || 0);
    const newCount = baseCount + 1;

    if (newCount >= MAX_ATTEMPTS) {
      const lockUntil = new Date(nowMs + LOCKOUT_WINDOW_MS).toISOString();
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
         SET failed_count = ?, last_attempt_at = ?, locked_until = NULL
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
