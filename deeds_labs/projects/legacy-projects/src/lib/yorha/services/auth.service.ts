import { randomBytes, pbkdf2Sync, createHmac, timingSafeEqual } from 'crypto';

export interface AuthPayload {
  userId: string;
  expiresAt: number; // epoch ms
}

/**
 * Simple AuthService:
 * - hashPassword / verifyPassword use PBKDF2 with a random salt
 * - createToken / verifyToken use an HMAC-signed JSON payload
 *
 * This is intentionally small and dependency-free so it compiles cleanly.
 */

const SECRET = process.env.AUTH_SECRET || randomBytes(32).toString('hex');
const PBKDF2_ITER = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha256';

function base64UrlEncode(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string) {
  // convert back to base64
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

export class AuthService {
  /**
   * Hash a password. Returned format: salt:derivedHex
   */
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = pbkdf2Sync(password, salt, PBKDF2_ITER, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString(
      'hex'
    );
    return `${salt}:${derived}`;
  }

  /**
   * Verify a password against a hash produced by hashPassword.
   */
  async verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split(':');
    if (parts.length !== 2) return false;
    const [salt, derivedHex] = parts;
    const derivedCheck = pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITER,
      PBKDF2_KEYLEN,
      PBKDF2_DIGEST
    ).toString('hex');
    try {
      const a = Buffer.from(derivedHex, 'hex');
      const b = Buffer.from(derivedCheck, 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Create a signed token containing userId and expiry (ms since epoch).
   * token = base64Url(payload) + "." + hexSignature
   */
  async createToken(userId: string, ttlMs = 1000 * 60 * 60 * 24): Promise<string> {
    const payload: AuthPayload = {
      userId,
      expiresAt: Date.now() + ttlMs,
    };
    const payloadJson = JSON.stringify(payload);
    const payloadB64 = base64UrlEncode(Buffer.from(payloadJson, 'utf8'));
    const sig = createHmac('sha256', SECRET).update(payloadB64).digest('hex');
    return `${payloadB64}.${sig}`;
  }

  /**
   * Verify token signature and expiry. Returns payload or null if invalid.
   */
  async verifyToken(token: string): Promise<AuthPayload | null> {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigHex] = parts;
    const expectedSig = createHmac('sha256', SECRET).update(payloadB64).digest('hex');
    try {
      const a = Buffer.from(sigHex, 'hex');
      const b = Buffer.from(expectedSig, 'hex');
      if (a.length !== b.length) return null;
      if (!timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }
    try {
      const payloadBuf = base64UrlDecode(payloadB64);
      const payload = JSON.parse(payloadBuf.toString('utf8')) as AuthPayload;
      if (typeof payload.expiresAt !== 'number' || typeof payload.userId !== 'string') return null;
      if (Date.now() > payload.expiresAt) return null;
      return payload;
    } catch {
      return null;
    }
  }
}

export default new AuthService();
