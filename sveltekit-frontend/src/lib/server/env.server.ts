/**
 * Runtime-safe environment parsing.
 *
 * Standalone process entrypoints must load environment files before importing
 * this module. SvelteKit server code should use the framework environment
 * contract or values made available by its server runtime.
 *
 * This module intentionally does NOT probe filesystem paths or load .env
 * itself — environment loading and environment parsing are separate
 * concerns. See `src/lib/server/config/load-runtime-env.js` for the loader
 * standalone entrypoints (TRACE MCP, graphify launcher, worker launcher,
 * validation scripts) should call before importing this module.
 *
 * Optional service URLs below have NO hardcoded fallback — an unset value
 * stays `undefined` rather than a guessed localhost URL or placeholder
 * credential. Consumers (e.g. /api/health) must treat `undefined` as
 * "not configured", not attempt a connection with an invented target.
 */

const privateEnv: NodeJS.ProcessEnv = process.env;

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (!value?.trim()) return defaultValue;

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

function parseInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

export const ENV = Object.freeze({
  NODE_ENV: privateEnv.NODE_ENV ?? 'development',

  DATABASE_URL: privateEnv.DATABASE_URL,

  REDIS_URL: privateEnv.REDIS_URL ?? 'redis://127.0.0.1:6379/0',
  REDIS_HOST: privateEnv.REDIS_HOST ?? '127.0.0.1',
  REDIS_PORT: privateEnv.REDIS_PORT ?? '6379',
  REDIS_PASSWORD: privateEnv.REDIS_PASSWORD,
  REDIS_DB: privateEnv.REDIS_DB ?? '0',

  QDRANT_URL: privateEnv.QDRANT_URL ?? 'http://127.0.0.1:6333',

  TENSORRT_URL: privateEnv.TENSORRT_URL,
  TRITON_URL: privateEnv.TRITON_URL,
  LANGEXTRACT_URL: privateEnv.LANGEXTRACT_URL ?? privateEnv.MINIFORGE_SIDECAR_URL,
  MINIFORGE_SIDECAR_URL: privateEnv.MINIFORGE_SIDECAR_URL,

  SEAWEED_ENDPOINT: privateEnv.SEAWEED_ENDPOINT ?? privateEnv.MINIO_ENDPOINT,
  MINIO_ENDPOINT: privateEnv.MINIO_ENDPOINT ?? privateEnv.SEAWEED_ENDPOINT,

  OLLAMA_BASE_URL: privateEnv.OLLAMA_BASE_URL ?? privateEnv.OLLAMA_URL,
  OLLAMA_EMBED_BASE_URL: privateEnv.OLLAMA_EMBED_BASE_URL,

  QUIC_HEALTH_URL: privateEnv.QUIC_HEALTH_URL,

  GO_SEARCH_URL: privateEnv.GO_SEARCH_URL,
  GO_SEARCH_GRPC_URL: privateEnv.GO_SEARCH_GRPC_URL,

  RABBITMQ_URL: privateEnv.RABBITMQ_URL,
  COUCHDB_URL: privateEnv.COUCHDB_URL,
  // Host-dev default matches the docker-compose port mapping (7687 bolt,
  // 7474 HTTP) exposed directly on the same port numbers. NEO4J_PASSWORD has
  // no default — it's a credential and must come from .env.local; consumers
  // that need it (getNeo4jDriver, TRACE MCP) must fail loudly, not silently
  // connect with an empty/undefined auth token.
  NEO4J_URI: privateEnv.NEO4J_URI ?? 'bolt://127.0.0.1:7687',
  NEO4J_USER: privateEnv.NEO4J_USER ?? 'neo4j',
  NEO4J_PASSWORD: privateEnv.NEO4J_PASSWORD,
  NATS_URL: privateEnv.NATS_URL,

  EMBEDDING_QUIC_ENABLED: parseBoolean(privateEnv.EMBEDDING_QUIC_ENABLED, false),
  EMBEDDING_GRPC_ENABLED: parseBoolean(privateEnv.EMBEDDING_GRPC_ENABLED, false),
  EMBEDDING_GRPC_URL: privateEnv.EMBEDDING_GRPC_URL ?? '127.0.0.1:50051',

  ACE_EMBED_BATCH_TIMEOUT_MS: parseInteger(
    privateEnv.ACE_EMBED_BATCH_TIMEOUT_MS,
    15_000,
    'ACE_EMBED_BATCH_TIMEOUT_MS'
  ),

  ENABLE_LANGGRAPH: parseBoolean(
    privateEnv.ENABLE_LANGGRAPH ?? privateEnv.LANGGRAPH_ENABLED ?? privateEnv.LANGGRAPH,
    false
  ),
});

/** SeaweedFS master port (cluster status endpoint), used by /api/health. */
export const SEAWEED_MASTER_PORT = parseInteger(
  privateEnv.SEAWEED_MASTER_PORT ?? privateEnv.SEAWEED_S3_PORT,
  9333,
  'SEAWEED_MASTER_PORT'
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
