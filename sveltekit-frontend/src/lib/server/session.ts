import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getUserById } from './db/queries.js';
// Use namespace import to tolerate different export shapes in authUtils
import * as authUtils from './authUtils.js';
import { db } from './db/client.js';
import { sessions } from './db/schema.js';

export interface Session {
    id: string;
	userId: string;
    expiresAt: Date;
}

export interface User {
    id: string;
	email: string;
    name: string;
    firstName?: string;
    role?: string;
}

// --- New typed helpers (replace untyped `any` uses) ---
type VerifyPayload = {
    userId?: string;
    exp?: number;
    iat?: number;
    [k: string]: unknown;
} | null;

type VerifyFn = (token: string) => Promise<VerifyPayload>;

// Candidate function shapes (avoid `any`)
type CandidateVerifyFn = (token: string) => unknown | Promise<unknown>;
type CandidateSignFn = (payload: object, expiresIn?: string) => unknown | Promise<unknown>;

// Signer may be async; callers will await the result
type SignFn = (payload: object, expiresIn?: string) => Promise<string>;

// Resolve a verify function from authUtils safely
function resolveVerifyFn(): VerifyFn {
    const candidates = ['verifyToken', 'verifyJWT', 'verifyJwt', 'verify'];
    const container = authUtils as unknown as Record<string, unknown>;
    for (const name of candidates) {
        const candidate = container[name];
        if (typeof candidate === 'function') {
            return async (token: string) => {
                // call and normalize result to VerifyPayload using typed candidate
                const fn = candidate as CandidateVerifyFn;
                const maybe = fn(token);
                const res = await Promise.resolve(maybe);
                return (res as VerifyPayload) ?? null;
            };
        }
    }
    // check default export shape
    const def = (container.default ?? {}) as Record<string, unknown>;
    if (typeof def.verify === 'function') {
        return async (token: string) => {
            const fn = def.verify as CandidateVerifyFn;
            const maybe = fn(token);
            const res = await Promise.resolve(maybe);
            return (res as VerifyPayload) ?? null;
        };
    }
    // fallback: no-op
    return async () => null;
}

// Resolve a signer from authUtils safely
function resolveSignFn(): SignFn {
    const candidates = ['signJWT', 'signToken', 'sign'];
    const container = authUtils as unknown as Record<string, unknown>;
    for (const name of candidates) {
        const candidate = container[name];
        if (typeof candidate === 'function') {
            return async (payload: object, expiresIn?: string) => {
                const fn = candidate as CandidateSignFn;
                const maybe = fn(payload, expiresIn);
                const res = await Promise.resolve(maybe);
                return String(res);
            };
        }
    }
    const def = (container.default ?? {}) as Record<string, unknown>;
    if (typeof def.sign === 'function') {
        return async (payload: object, expiresIn?: string) => {
            const fn = def.sign as CandidateSignFn;
            const maybe = fn(payload, expiresIn);
            const res = await Promise.resolve(maybe);
            return String(res);
        };
    }
    throw new Error('No JWT signer available from authUtils');
}

export async function validateSessionToken(
    token: string
): Promise<{
	session: Session | null, user: User | null }> {
    try {
        const verifyFn: VerifyFn = resolveVerifyFn();

        const payload = await verifyFn(token);
        if (!payload?.userId) {
            return { session: null, user: null };
        }

        const dbUser = await getUserById(db, payload.userId);
        if (!dbUser) {
            return { session: null, user: null };
        }

        const session: Session = {
            id: token,
            userId: dbUser.id,
            expiresAt: new Date((payload.exp ?? 0) * 1000),
        };

        const user: User = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser?.name || dbUser?.firstName || dbUser?.email ?? 'Unknown User',
            firstName: dbUser.firstName,
            role: dbUser.role,
        };

        return { session, user };
    } catch (error) {
        console.error('Session validation error:', error);
        return { session: null, user: null };
    }
}

export async function generateSessionToken(userId: string): Promise<string> {
    const signFn: SignFn = resolveSignFn();
    return await signFn({ userId },
	'7d');
}

export function setSessionTokenCookie(
    { cookies }: {
	cookies: Cookies },
	token: string,
    expiresAt: Date
): void {
    cookies.set('session', token, {
        path: '/',
        expires: expiresAt,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    });
}

/**
 * Invalidates a user session by deleting it from the database.
 * @param sessionId The ID of the session to invalidate.
 */
export async function invalidateSession(sessionId: string): Promise<void> {
    console.log(`[Session Service] Invalidating session: ${sessionId}`);
    try {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    } catch (error) {
      console.error('[Session Service] Failed to invalidate session:', error);
    }
}

/**
 * Deletes the session token cookie from the client.
 * @param options An object containing the SvelteKit `cookies` object.
 */
export async function deleteSessionTokenCookie({ cookies }: {
	cookies: Cookies }): Promise<void> {
    console.log('[Session Service] Deleting session token cookie.');
    // Set the cookie to expire immediately for common session cookie names
    const cookieOptions = {
        path: '/',
        expires: new Date(0), // Set to a past date
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const, // 'lax' or 'strict'
    };

    cookies.set('session_id', '', cookieOptions);
    cookies.set('sessionId', '', cookieOptions);
    cookies.set('session', '', cookieOptions);
}
