import crypto from 'crypto';

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || 'kurox2026admin';
export const ADMIN_COOKIE_NAME = 'printkurox_admin_session';

/**
 * Validates admin passcode using timing-safe comparison to prevent timing attacks.
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
 * Creates a signed 30-day admin session token: payload.signature
 */
export function createAdminToken(): string {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const payload = JSON.stringify({ role: 'admin', exp: expiresAt });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(base64Payload)
    .digest('base64url');
  return `${base64Payload}.${signature}`;
}

/**
 * Verifies an admin session token's cryptographic signature and expiration.
 */
export function verifyAdminToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [base64Payload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(base64Payload)
    .digest('base64url');

  if (signature.length !== expectedSignature.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf-8'));
    if (payload.exp && Date.now() > payload.exp) {
      return false; // Expired
    }
    return payload.role === 'admin';
  } catch {
    return false;
  }
}
