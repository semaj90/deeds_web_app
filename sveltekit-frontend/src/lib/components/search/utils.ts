import type { dev } from '$app/environment';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * Server-Side Authentication Utilities
 * Provides shared helpers for authentication, user resolution,
 * and development bypass functionality across API endpoints.
 */

// Typed environment access for import.meta.env
export type MetaEnv = {
    REDIS_URL?: string;
    DEV_BYPASS_AUTH?: string;
    [key: string]: string | undefined;
};

/**
 * Get typed access to import.meta.env
 */
export function getMetaEnv(): MetaEnv {
    return (import.meta as unknown as { env: MetaEnv }).env;
}

// Added types to avoid relying on App.Locals['user'] which may not exist
export type User = {
    id: string;
    email?: string | null;
    name?: string | null;
    [k: string]: unknown;
};

/**
 * Development stub user returned when DEV_BYPASS_AUTH is enabled
 * typed to match `User` so downstream functions can rely on a single User type.
 */
export const DEV_STUB_USER: User = {
    id: '1',
    email: 'dev@local',
    name: 'Developer'
};

// Define a small local type for SvelteKit locals.
export type AppLocals = {
    [key: string]: any;
};

// Keep previous API but base it on the local AppLocals type
export type LocalsWithUser = AppLocals & {
    user?: User | null;
};

/**
 * Return true when running in dev and DEV_BYPASS_AUTH is set to a truthy value.
 * Allowed truthy values: "1", "true", "yes", "on" (case-insensitive).
 */
export function isDevBypassEnabled(): boolean {
    // Only allow bypass in dev environment
    // Use dynamic import for dev to avoid bundling issues if needed, or assume it's false in prod
    // For now assuming 'dev' from $app/environment is available or we check process.env.NODE_ENV
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) return false;

    const env = getMetaEnv();
    const raw = String(env.DEV_BYPASS_AUTH ?? '').trim().toLowerCase();
    if (!raw) return false;
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

/**
 * Resolve user from locals with optional development bypass
 */
export function resolveUser(locals: any): User | null {
    if (isDevBypassEnabled()) {
        return DEV_STUB_USER;
    }
    return locals?.user ?? null;
}

/**
 * Require authenticated user or throw error
 */
export function requireUser(
    locals: LocalsWithUser,
    errorMessage = 'User authentication required'
): User {
    const user = resolveUser(locals);
    if (!user) {
        throw new Error(errorMessage);
    }
    return user;
}

/**
 * Get user ID safely with dev bypass support
 */
export function getUserId(locals: LocalsWithUser): string | null {
    const user = resolveUser(locals);
    return user?.id ?? null;
}

/**
 * Check if user is authenticated (including dev bypass)
 */
export function isAuthenticated(locals: LocalsWithUser): boolean {
    return resolveUser(locals) !== null;
}
