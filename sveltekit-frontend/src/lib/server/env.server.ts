/**
 * @fileoverview
 * Runtime-safe server environment access for both:
 * - SvelteKit/Vite SSR
 * - standalone Node.js/tsx workers such as TRACE MCP
 *
 * `vite dev` does NOT populate process.env from .env (this repo's
 * vite.config.ts explicitly opts out of loadEnv — see the comment at
 * "Don't load env vars with loadEnv - let SvelteKit handle it naturally").
 * SvelteKit's own $env/dynamic/private only reaches code that imports it;
 * this module and most of src/lib/server/**, src/mcp/**, and scripts/**
 * read raw process.env directly, so without an explicit load here every
 * process.env.* read below is silently undefined when started via plain
 * `vite dev` / `npm run dev` (verified 2026-08-01: REDIS_PASSWORD,
 * REDIS_URL, etc. all undefined in that process, causing every dependent
 * service probe in /api/health to report a false "Service unreachable").
 * Loading .env here — once, at import time — makes this module correct
 * regardless of how the process was started. dotenv never overwrites a
 * variable that's already set (e.g. by Docker/CI), so this is additive only.
 */
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

if (!process.env.__ENV_SERVER_DOTENV_LOADED__) {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/lib/server/env.server.ts -> sveltekit-frontend/ is 3 levels up
  const projectRoot = join(here, '..', '..', '..');
  loadDotenv({ path: join(projectRoot, '.env') });
  loadDotenv({ path: join(projectRoot, '.env.local'), override: true });
  process.env.__ENV_SERVER_DOTENV_LOADED__ = '1';
}

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
  REDIS_HOST: privateEnv.REDIS_HOST,
  REDIS_PORT: privateEnv.REDIS_PORT,
  REDIS_PASSWORD: privateEnv.REDIS_PASSWORD,
  QDRANT_URL: privateEnv.QDRANT_URL ?? 'http://127.0.0.1:6333',

  // Feature flags should be booleans, not string literals.
  ENABLE_LANGGRAPH: parseBoolean(
    privateEnv.ENABLE_LANGGRAPH ?? privateEnv.LANGGRAPH_ENABLED ?? privateEnv.LANGGRAPH,
    false
  ),

  // --- Service URLs used by /api/health and the embedding gRPC client ---
  // Defaults mirror the canonical ports documented in CLAUDE.md / src/lib/config/env.server.ts.
  TENSORRT_URL: privateEnv.TENSORRT_URL ?? 'http://127.0.0.1:8099',
  TRITON_URL: privateEnv.TRITON_URL ?? 'http://127.0.0.1:8000',
  LANGEXTRACT_URL:
    privateEnv.LANGEXTRACT_URL ?? privateEnv.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095',
  MINIFORGE_SIDECAR_URL: privateEnv.MINIFORGE_SIDECAR_URL,
  SEAWEED_ENDPOINT: privateEnv.SEAWEED_ENDPOINT ?? privateEnv.MINIO_ENDPOINT ?? '127.0.0.1',
  MINIO_ENDPOINT: privateEnv.MINIO_ENDPOINT ?? privateEnv.SEAWEED_ENDPOINT ?? '127.0.0.1',
  OLLAMA_BASE_URL: privateEnv.OLLAMA_BASE_URL ?? privateEnv.OLLAMA_URL ?? 'http://127.0.0.1:11434',
  OLLAMA_EMBED_BASE_URL: privateEnv.OLLAMA_EMBED_BASE_URL,
  QUIC_HEALTH_URL: privateEnv.QUIC_HEALTH_URL ?? 'http://127.0.0.1:4433/health',
  GO_SEARCH_URL: privateEnv.GO_SEARCH_URL ?? 'http://127.0.0.1:8096',
  GO_SEARCH_GRPC_URL: privateEnv.GO_SEARCH_GRPC_URL ?? '127.0.0.1:50055',
  RABBITMQ_URL: privateEnv.RABBITMQ_URL ?? 'amqp://guest:guest@127.0.0.1:5672',
  COUCHDB_URL: privateEnv.COUCHDB_URL ?? 'http://admin:password@127.0.0.1:5984',
  NEO4J_URI: privateEnv.NEO4J_URI ?? 'bolt://127.0.0.1:7687',
  NATS_URL: privateEnv.NATS_URL ?? '127.0.0.1:4222',

  EMBEDDING_QUIC_ENABLED: parseBoolean(privateEnv.EMBEDDING_QUIC_ENABLED, false),
  EMBEDDING_GRPC_ENABLED: parseBoolean(privateEnv.EMBEDDING_GRPC_ENABLED, false),
  EMBEDDING_GRPC_URL: privateEnv.EMBEDDING_GRPC_URL ?? '127.0.0.1:50051',
  ACE_EMBED_BATCH_TIMEOUT_MS: Number(privateEnv.ACE_EMBED_BATCH_TIMEOUT_MS ?? 15000),

  // Add the remaining existing environment properties here.
});

/** SeaweedFS master port (cluster status endpoint), used by /api/health. */
export const SEAWEED_MASTER_PORT = Number(
  privateEnv.SEAWEED_MASTER_PORT ?? privateEnv.SEAWEED_S3_PORT ?? 9333
);

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
