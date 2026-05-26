/**
 * auth-utils.ts — Centralized authentication helpers for SvelteKit server routes
 *
 * Usage in +server.ts:
 *   import { requireUser, requireAdmin } from '$lib/server/auth-utils.js';
 *
 *   export const GET: RequestHandler = async (event) => {
 *     const user = requireUser(event);  // throws Response(401) if not authed
 *     ...
 *   };
 */

import { error, type RequestEvent } from '@sveltejs/kit';

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

/**
 * Asserts the request is from an authenticated user.
 * Throws a 401 SvelteKit error if not, which SvelteKit converts to an HTTP 401 response.
 *
 * @returns The authenticated user object from locals.user
 */
export function requireUser(event: RequestEvent): AuthUser {
  const user = event.locals.user;
  if (!user) {
    throw error(401, 'Authentication required');
  }
  return user as AuthUser;
}

/**
 * Asserts the request is from an authenticated admin user.
 * Throws 401 if not authenticated, 403 if not admin.
 */
export function requireAdmin(event: RequestEvent): AuthUser {
  const user = requireUser(event);
  if (user.role !== 'admin' && user.role !== 'superadmin') {
    throw error(403, 'Admin access required');
  }
  return user;
}

/**
 * Soft auth check — returns the user or null without throwing.
 * Use when the route works for both authed and unauthed users.
 */
export function getUser(event: RequestEvent): AuthUser | null {
  return (event.locals.user as AuthUser) ?? null;
}

/**
 * Returns the internal service key from request headers.
 * Validates against INTERNAL_SERVICE_KEY env var.
 * Use for server-to-server routes that don't use user sessions.
 */
export function validateServiceKey(event: RequestEvent): boolean {
  const provided = event.request.headers.get('x-service-key');
  const expected = process.env.INTERNAL_SERVICE_KEY;
  if (!expected || !provided) return false;
  return provided === expected;
}

/**
 * Requires either a valid user session OR a valid internal service key.
 * Returns { user } or { serviceKey: true }.
 */
export function requireUserOrService(
  event: RequestEvent
): { user: AuthUser } | { serviceKey: true } {
  const user = event.locals.user as AuthUser | undefined;
  if (user) return { user };

  if (validateServiceKey(event)) return { serviceKey: true };

  throw error(401, 'Authentication required');
}
