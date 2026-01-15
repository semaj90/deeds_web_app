import { env as privateEnv } from '$env/dynamic/private';

/**
 * Centralized environment variable access.
 * All $env imports should be restricted to this file to prevent
 * import corruption and ensure type safety.
 * Note: Public env not imported here to avoid SSR issues - use privateEnv only
 */
export const env = {
    ...privateEnv,
    ...privateEnv
};


