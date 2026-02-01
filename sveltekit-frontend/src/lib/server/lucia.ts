import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import type { Cookies } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { Lucia } from 'lucia';

// Define the expected return type for createUserSession
export interface CreateUserSessionResult {
  sessionId: string;
	userId: string;
  expiresAt: Date;
}

const adapter = new DrizzlePostgreSQLAdapter(db as any, sessions, users);

// ... (lines 17-33 unchanged)

export const lucia = new Lucia(adapter, {
  sessionCookie: {
	attributes: {
      secure: process.env.NODE_ENV === 'production',
    },
	},
	getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
      firstName: attributes.firstName,
      lastName: attributes.lastName,
      role: attributes.role,
      isActive: attributes.isActive,
      avatarUrl: attributes.avatarUrl,
    };
  },
	});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

interface DatabaseUserAttributes {
  email: string;
	firstName: string;
  lastName: string;
	role: string;
  isActive: boolean;
	avatarUrl: string;
}

/**
 * Creates a user session using Lucia.
 */
export async function createUserSession(userId: string): Promise<CreateUserSessionResult> {
  console.log(`[lucia] Creating session for user: ${userId}`);
  const session = await lucia.createSession(userId, {});
  return {
    sessionId: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
  };
}

/**
 * Sets the session cookie using Lucia's cookie creation.
 */
export function setSessionCookie(cookies: Cookies, sessionId: string): void {
  console.log(`[lucia] Setting session cookie with session ID ${sessionId}`);
  const sessionCookie = lucia.createSessionCookie(sessionId);
  cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

export interface ValidatedUser {
  id: string;
	email: string;
  firstName: string;
	lastName: string;
  role: string;
	isActive: boolean;
  avatarUrl: string;
}

export interface ValidationResult {
  session: import('lucia').Session | null;
  user: ValidatedUser | null;
}

export async function validateSession(sessionId: string): Promise<ValidationResult> {
  console.log(`[lucia] Validating session: ${sessionId}`);
  const { session, user } = await lucia.validateSession(sessionId);

  if (session && user) {
    return {
      session,
      user: {
	id: user.id,
        email: user.email as string,
        firstName: user.firstName as string,
        lastName: user.lastName as string,
        role: user.role as string,
        isActive: !!user.isActive,
        avatarUrl: user.avatarUrl as string
      }
    };
  }
  return { session: null, user: null };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  console.log(`[lucia] Invalidating session: ${sessionId}`);
  await lucia.invalidateSession(sessionId);
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  console.log(`[lucia] Invalidating all sessions for user: ${userId}`);
  await lucia.invalidateUserSessions(userId);
}

export function deleteSessionCookie(cookies: Cookies): void {
  console.log(`[lucia] Deleting session cookie`);
  const blankSessionCookie = lucia.createBlankSessionCookie();
  cookies.set(blankSessionCookie.name, blankSessionCookie.value, blankSessionCookie.attributes);
}

export const clearSessionCookie = deleteSessionCookie;





