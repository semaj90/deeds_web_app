import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Centralized environment variable access.
 * All $env imports should be restricted to this file to prevent
 * import corruption and ensure type safety.
 */
export const env = {
    ...publicEnv,
    ...privateEnv
};

