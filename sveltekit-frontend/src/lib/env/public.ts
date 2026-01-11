import { env as publicEnv } from '$env/dynamic/public';

/**
 * Centralized public environment variable access.
 * Safe for client-side use.
 */
export const env = {
    ...publicEnv
};

