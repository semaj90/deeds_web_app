/**
 * @fileoverview
 * Runtime-safe server environment access for both:
 * - SvelteKit/Vite SSR
 * - standalone Node.js/tsx workers such as TRACE MCP
 *
 * Environment files should be loaded by process entry points before this
 * module is imported.
 */

const privateEnv: NodeJS.ProcessEnv = process.env;

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;

    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;

    default:
      return defaultValue;
  }
}

/**
 * Canonical, immutable runtime environment.
 *
 * Keep all existing ENV properties here. Do not declare a second ENV object
 * elsewhere in this file.
 */
export const ENV = Object.freeze({
  NODE_ENV: privateEnv.NODE_ENV ?? 'development',

  // Preserve your existing entries, for example:
  DATABASE_URL: privateEnv.DATABASE_URL,
  REDIS_URL: privateEnv.REDIS_URL,
  QDRANT_URL: privateEnv.QDRANT_URL,

  // Feature flags should be booleans, not string literals.
  ENABLE_LANGGRAPH: parseBoolean(
    privateEnv.ENABLE_LANGGRAPH ?? privateEnv.LANGGRAPH_ENABLED ?? privateEnv.LANGGRAPH,
    false
  ),

  // Add the remaining existing environment properties here.
});

/**
 * Names supported by the centralized feature-flag reader.
 */
export type FeatureFlagName = 'LANGGRAPH';

/**
 * Canonical feature-flag access.
 *
 * This checks configuration only. Dependency readiness should be checked by a
 * separate runtime health probe, not through globalThis.
 */
export const EnvSource = Object.freeze({
  getFeatureFlag(flagName: FeatureFlagName): boolean {
    switch (flagName) {
      case 'LANGGRAPH':
        return ENV.ENABLE_LANGGRAPH;

      default: {
        const exhaustiveCheck: never = flagName;
        return exhaustiveCheck;
      }
    }
  },
});

/**
 * Convenience helper for consumers that do not need EnvSource directly.
 */
export function isLangGraphEnabled(): boolean {
  return ENV.ENABLE_LANGGRAPH;
}
