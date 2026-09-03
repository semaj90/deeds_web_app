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

const nodeEnvironment = privateEnv.NODE_ENV ?? 'development';
const devBypassAuth = parseBoolean(privateEnv.DEV_BYPASS_AUTH, false);

if (nodeEnvironment === 'production' && devBypassAuth) {
  throw new Error('DEV_BYPASS_AUTH_FORBIDDEN_IN_PRODUCTION');
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
  NODE_ENV: nodeEnvironment,

  DATABASE_URL: privateEnv.DATABASE_URL,

  VALKEY_URL: privateEnv.VALKEY_URL ?? privateEnv.REDIS_URL ?? 'redis://127.0.0.1:6379/0',
  VALKEY_PASSWORD: privateEnv.VALKEY_PASSWORD ?? privateEnv.REDIS_PASSWORD,

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

  // Self-referencing origin for server-side code calling this app's own
  // /api/* routes (e.g. /api/embed for its Redis L1 + Bifrost L2 cache).
  // Dev default matches `npm run dev`'s Vite port. Production deployments
  // behind adapter-node/reverse-proxy MUST set SELF_URL explicitly.
  SELF_URL: privateEnv.SELF_URL ?? privateEnv.ORIGIN ?? 'http://127.0.0.1:5173',

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

  // ── Below: keys referenced across src/ via ENV.<KEY> but historically
  // missing from this frozen object (audited 2026-08-02 — 154 used-but-
  // undeclared keys found; every access silently returned `undefined`).
  // Boolean-shaped keys use parseBoolean(); everything else is a plain
  // string passthrough (no hardcoded fallback), matching this file's
  // documented convention. A few keys are read via `=== 'true'` / `=== 'false'`
  // string comparisons at their call sites, so they stay string-typed
  // rather than parseBoolean()'d — see ACE_ENCODED_PREFILTER_ENABLED,
  // AGENT_TRACE_ENABLED, ENABLE_LEGACY_ATLAS_FIELDS, MINIO_USE_SSL,
  // LANGEXTRACT_NATIVE.
  ACE_CONCEPT_EXTRACTION_MODE: privateEnv.ACE_CONCEPT_EXTRACTION_MODE,
  ACE_CONCEPT_EXTRACTION_TIMEOUT_MS: privateEnv.ACE_CONCEPT_EXTRACTION_TIMEOUT_MS,
  ACE_ENCODED_PREFILTER_ENABLED: privateEnv.ACE_ENCODED_PREFILTER_ENABLED,
  ACE_ENCODED_PREFILTER_MODE: privateEnv.ACE_ENCODED_PREFILTER_MODE,
  ACE_ENCODED_RERANK_ENABLED: parseBoolean(privateEnv.ACE_ENCODED_RERANK_ENABLED, false),
  ACE_ENCODED_RERANK_WEIGHT: privateEnv.ACE_ENCODED_RERANK_WEIGHT,
  AGENT_TRACE_ENABLED: privateEnv.AGENT_TRACE_ENABLED,
  BIFROST_ENABLED: parseBoolean(privateEnv.BIFROST_ENABLED, false),
  BIFROST_OPENAI_BASE_URL: privateEnv.BIFROST_OPENAI_BASE_URL,
  BIFROST_URL: privateEnv.BIFROST_URL,
  CHR97_GRPC_ENABLED: parseBoolean(privateEnv.CHR97_GRPC_ENABLED, false),
  CHR97_GRPC_URL: privateEnv.CHR97_GRPC_URL,
  CODEBASE_INDEX_URL: privateEnv.CODEBASE_INDEX_URL,
  CODEINTEL_GRPC_ENABLED: parseBoolean(privateEnv.CODEINTEL_GRPC_ENABLED, false),
  CODEINTEL_GRPC_URL: privateEnv.CODEINTEL_GRPC_URL,
  CONTEXT7_MCP_URL: privateEnv.CONTEXT7_MCP_URL,
  CRAWL4AI_HOST: privateEnv.CRAWL4AI_HOST,
  CROSS_ENCODER_MODEL: privateEnv.CROSS_ENCODER_MODEL,
  CUDA_DEVICE_ID: privateEnv.CUDA_DEVICE_ID,
  CUDA_MAX_STREAMS: privateEnv.CUDA_MAX_STREAMS,
  CUDA_SERVICE_URL: privateEnv.CUDA_SERVICE_URL,
  CUVS_BENCH_URL: privateEnv.CUVS_BENCH_URL,
  ATLAS_RAPIDS_SIDECAR_URL: privateEnv.ATLAS_RAPIDS_SIDECAR_URL,
  COMMUNITY_TAXONOMY_ALGORITHM: privateEnv.COMMUNITY_TAXONOMY_ALGORITHM,
  DEV_BYPASS_AUTH: devBypassAuth,
  DOCLING_SERVICE_URL: privateEnv.DOCLING_SERVICE_URL,
  EMBED_MODEL_PATH: privateEnv.EMBED_MODEL_PATH,
  EMBEDDING_BASE_URL: privateEnv.EMBEDDING_BASE_URL,
  // EMBED-PROVIDER-CONVERGENCE-01: compatibility input only, consumed
  // exclusively by resolveEmbeddingProviderV1() (embedding-provider-v1.ts).
  // No other module should read this directly.
  EMBED_SERVER_URL: privateEnv.EMBED_SERVER_URL,
  EMBEDDING_SERVER_MODEL: privateEnv.EMBEDDING_SERVER_MODEL,
  EMBEDDING_MODEL_ARTIFACT_REVISION: privateEnv.EMBEDDING_MODEL_ARTIFACT_REVISION,
  EMBEDDING_TOKENIZER_REVISION: privateEnv.EMBEDDING_TOKENIZER_REVISION,
  EMBEDDING_INPUT_POLICY_REVISION: privateEnv.EMBEDDING_INPUT_POLICY_REVISION,
  NEURAL_DECODER_URL: privateEnv.NEURAL_DECODER_URL,
  // PREFILL-CALLER-01: default OFF. SHADOW_READONLY only -- never influences
  // ranking, never a canonical write. See neural-decoder-prefill-shadow.ts.
  NEURAL_DECODER_PREFILL_SHADOW_ENABLED: parseBoolean(privateEnv.NEURAL_DECODER_PREFILL_SHADOW_ENABLED, false),
  ATLAS_CANONICAL_EMBEDDING_STRICT: parseBoolean(privateEnv.ATLAS_CANONICAL_EMBEDDING_STRICT, false),
  EMBEDDING_PROVIDER: privateEnv.EMBEDDING_PROVIDER,
  ENABLE_CUVS_SEARCH: parseBoolean(privateEnv.ENABLE_CUVS_SEARCH, false),
  ENABLE_LEGACY_ATLAS_FIELDS: privateEnv.ENABLE_LEGACY_ATLAS_FIELDS,
  ENHANCED_RAG_URL: privateEnv.ENHANCED_RAG_URL,
  FASTAPI_URL: privateEnv.FASTAPI_URL,
  FFMPEG_PATH: privateEnv.FFMPEG_PATH,
  FIRECRAWL_API_KEY: privateEnv.FIRECRAWL_API_KEY,
  FRONTEND_BASE_URL: privateEnv.FRONTEND_BASE_URL,
  FUNCTION_GEMMA_MODEL: privateEnv.FUNCTION_GEMMA_MODEL,
  GEMMA4_MODEL: privateEnv.GEMMA4_MODEL,
  GENERATION_GRPC_URL: privateEnv.GENERATION_GRPC_URL,
  GENERATION_SERVICE_URL: privateEnv.GENERATION_SERVICE_URL,
  GITHUB_TOKEN: privateEnv.GITHUB_TOKEN,
  GO_RETRIEVAL_HTTP_ENABLED: parseBoolean(privateEnv.GO_RETRIEVAL_HTTP_ENABLED, false),
  GO_RETRIEVAL_HTTP_URL: privateEnv.GO_RETRIEVAL_HTTP_URL,
  GRANITE_DOCLING_ENABLED: parseBoolean(privateEnv.GRANITE_DOCLING_ENABLED, false),
  GRANITE_DOCLING_MODEL: privateEnv.GRANITE_DOCLING_MODEL,
  GRAPH_ML_GRPC_ENABLED: parseBoolean(privateEnv.GRAPH_ML_GRPC_ENABLED, false),
  GRAPH_ML_GRPC_URL: privateEnv.GRAPH_ML_GRPC_URL,
  HFORF_MODEL_PATH: privateEnv.HFORF_MODEL_PATH,
  HG_LOOKUP_URL: privateEnv.HG_LOOKUP_URL,
  IMAGE_SYNTHESIS_URL: privateEnv.IMAGE_SYNTHESIS_URL,
  INDEX_WORKER_URL: privateEnv.INDEX_WORKER_URL,
  JWT_SECRET: privateEnv.JWT_SECRET,
  KB_MCP_URL: privateEnv.KB_MCP_URL,
  LANGEXTRACT_ENABLED: parseBoolean(privateEnv.LANGEXTRACT_ENABLED, false),
  LANGEXTRACT_MCP_HOST: privateEnv.LANGEXTRACT_MCP_HOST,
  LANGEXTRACT_MCP_PORT: privateEnv.LANGEXTRACT_MCP_PORT,
  LANGEXTRACT_NATIVE: privateEnv.LANGEXTRACT_NATIVE,
  LANGFUSE_ENABLED: parseBoolean(privateEnv.LANGFUSE_ENABLED, false),
  LANGFUSE_HOST: privateEnv.LANGFUSE_HOST,
  LANGFUSE_PUBLIC_KEY: privateEnv.LANGFUSE_PUBLIC_KEY,
  LANGFUSE_SECRET_KEY: privateEnv.LANGFUSE_SECRET_KEY,
  LANGGRAPH_ENABLED: parseBoolean(privateEnv.LANGGRAPH_ENABLED, false),
  LANGGRAPH_URL: privateEnv.LANGGRAPH_URL,
  LDR_BASE_URL: privateEnv.LDR_BASE_URL,
  LDR_PASSWORD: privateEnv.LDR_PASSWORD,
  LDR_USERNAME: privateEnv.LDR_USERNAME,
  LEGAL_GATEWAY_URL: privateEnv.LEGAL_GATEWAY_URL,
  LITERT_BASE_URL: privateEnv.LITERT_BASE_URL,
  LLAMA_SERVER_URL: privateEnv.LLAMA_SERVER_URL,
  LLAMA_SERVER_MODEL: privateEnv.LLAMA_SERVER_MODEL,
  LLM_MODEL: privateEnv.LLM_MODEL,
  LOCAL_OPENAI_BASE_URL: privateEnv.LOCAL_OPENAI_BASE_URL,
  MINIO_ACCESS_KEY: privateEnv.MINIO_ACCESS_KEY,
  MINIO_EVIDENCE_BUCKET: privateEnv.MINIO_EVIDENCE_BUCKET,
  MINIO_LIBRARY_BUCKET: privateEnv.MINIO_LIBRARY_BUCKET,
  MINIO_PORT: privateEnv.MINIO_PORT,
  MINIO_SECRET_KEY: privateEnv.MINIO_SECRET_KEY,
  MINIO_URL: privateEnv.MINIO_URL,
  MINIO_USE_SSL: privateEnv.MINIO_USE_SSL,
  NEO4J_HTTP_URL: privateEnv.NEO4J_HTTP_URL,
  NLP_SIDECAR_URL: privateEnv.NLP_SIDECAR_URL,
  NTFY_TOPIC: privateEnv.NTFY_TOPIC,
  NTFY_URL: privateEnv.NTFY_URL,
  OBSIDIAN_API_KEY: privateEnv.OBSIDIAN_API_KEY,
  OBSIDIAN_URL: privateEnv.OBSIDIAN_URL,
  OBSIDIAN_VAULT_PATH: privateEnv.OBSIDIAN_VAULT_PATH,
  OLLAMA_EMBED_MODEL: privateEnv.OLLAMA_EMBED_MODEL,
  OLLAMA_VLM_MODEL: privateEnv.OLLAMA_VLM_MODEL,
  OPENAI_BASE_URL: privateEnv.OPENAI_BASE_URL,
  ORCHESTRATOR_URL: privateEnv.ORCHESTRATOR_URL,
  POSTGRES_DB: privateEnv.POSTGRES_DB,
  POSTGRES_HOST: privateEnv.POSTGRES_HOST,
  POSTGRES_PASSWORD: privateEnv.POSTGRES_PASSWORD,
  POSTGRES_PORT: privateEnv.POSTGRES_PORT,
  POSTGRES_USER: privateEnv.POSTGRES_USER,
  // Dev default matches `npm run dev`'s Vite port — same rationale as SELF_URL above.
  // Without this fallback, MCP tool handlers that build `${ENV.PUBLIC_API_URL}/api/...`
  // silently produce the literal string "undefined/api/..." when unset.
  PUBLIC_API_URL: privateEnv.PUBLIC_API_URL ?? privateEnv.ORIGIN ?? 'http://127.0.0.1:5173',
  PUBLIC_APP_URL: privateEnv.PUBLIC_APP_URL,
  PYTHON_PATH: privateEnv.PYTHON_PATH,
  QDRANT_API_KEY: privateEnv.QDRANT_API_KEY,
  RABBITMQ_MGMT_AUTH: privateEnv.RABBITMQ_MGMT_AUTH,
  RABBITMQ_MGMT_URL: privateEnv.RABBITMQ_MGMT_URL,
  RAG_SERVICE_URL: privateEnv.RAG_SERVICE_URL,
  RAG_USE_GO_RETRIEVAL: parseBoolean(privateEnv.RAG_USE_GO_RETRIEVAL, false),
  REDDIT_CLIENT_ID: privateEnv.REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET: privateEnv.REDDIT_CLIENT_SECRET,
  REDDIT_USERNAME: privateEnv.REDDIT_USERNAME,
  RERANK_BASE_URL: privateEnv.RERANK_BASE_URL,
  RERANK_URL: privateEnv.RERANK_URL,
  RERANKER_SIDECAR_URL: privateEnv.RERANKER_SIDECAR_URL,
  RETRIEVAL_GRPC_ENABLED: parseBoolean(privateEnv.RETRIEVAL_GRPC_ENABLED, false),
  RETRIEVAL_GRPC_URL: privateEnv.RETRIEVAL_GRPC_URL,
  RETRIEVAL_HTTP_ENABLED: parseBoolean(privateEnv.RETRIEVAL_HTTP_ENABLED, false),
  RETRIEVAL_HTTP_URL: privateEnv.RETRIEVAL_HTTP_URL,
  ROTORQUANT_CHAT_MODEL: privateEnv.ROTORQUANT_CHAT_MODEL,
  ROTORQUANT_MODEL_PATH: privateEnv.ROTORQUANT_MODEL_PATH,
  SDXL_SERVICE_URL: privateEnv.SDXL_SERVICE_URL,
  SEARXNG_URL: privateEnv.SEARXNG_URL,
  SEAWEED_ACCESS_KEY: privateEnv.SEAWEED_ACCESS_KEY,
  SEAWEED_S3_BUCKET: privateEnv.SEAWEED_S3_BUCKET,
  SEAWEED_S3_ENDPOINT: privateEnv.SEAWEED_S3_ENDPOINT,
  SEAWEED_S3_PORT: privateEnv.SEAWEED_S3_PORT,
  SEAWEED_S3_REGION: privateEnv.SEAWEED_S3_REGION,
  SEAWEED_SECRET_KEY: privateEnv.SEAWEED_SECRET_KEY,
  SERVICE_AUTH_TOKEN: privateEnv.SERVICE_AUTH_TOKEN,
  SMTP_FROM: privateEnv.SMTP_FROM,
  SMTP_HOST: privateEnv.SMTP_HOST,
  SMTP_PASS: privateEnv.SMTP_PASS,
  SMTP_PORT: privateEnv.SMTP_PORT,
  SMTP_USER: privateEnv.SMTP_USER,
  SVELTEKIT_ORIGIN: privateEnv.SVELTEKIT_ORIGIN,
  SVELTEKIT_SERVER_URL: privateEnv.SVELTEKIT_SERVER_URL,
  TOOL_GRPC_ENABLED: parseBoolean(privateEnv.TOOL_GRPC_ENABLED, false),
  TOOL_GRPC_URL: privateEnv.TOOL_GRPC_URL,
  TOOL_ROUTER_GRPC_URL: privateEnv.TOOL_ROUTER_GRPC_URL,
  TOPOLOGY_SEARCH_URL: privateEnv.TOPOLOGY_SEARCH_URL,
  TRACE_MCP_URL: privateEnv.TRACE_MCP_URL,
  TRITON_LLM_MODEL: privateEnv.TRITON_LLM_MODEL,
  TRITON_RERANKER_MODEL: privateEnv.TRITON_RERANKER_MODEL,
  TRITON_VISION_MODEL: privateEnv.TRITON_VISION_MODEL,
  TRITON_VLM_MODEL: privateEnv.TRITON_VLM_MODEL,
  TURBO_MMPROJ_PATH: privateEnv.TURBO_MMPROJ_PATH,
  TURBO_MODEL_PATH: privateEnv.TURBO_MODEL_PATH,
  TURBOQUANT_BASE_URL: privateEnv.TURBOQUANT_BASE_URL,
  TURBOQUANT_MODEL_PATH: privateEnv.TURBOQUANT_MODEL_PATH,
  TURBOQUANT_URL: privateEnv.TURBOQUANT_URL,
  TURBOVEC_SIDECAR: privateEnv.TURBOVEC_SIDECAR,
  TURBOVEC_SIDECAR_GRPC_ENABLED: parseBoolean(privateEnv.TURBOVEC_SIDECAR_GRPC_ENABLED, false),
  TURBOVEC_SIDECAR_GRPC_URL: privateEnv.TURBOVEC_SIDECAR_GRPC_URL,
  TURBOVEC_SIDECAR_JSONRPC_URL: privateEnv.TURBOVEC_SIDECAR_JSONRPC_URL,
  VAPID_CONTACT: privateEnv.VAPID_CONTACT,
  VAPID_PRIVATE_KEY: privateEnv.VAPID_PRIVATE_KEY,
  VAPID_PUBLIC_KEY: privateEnv.VAPID_PUBLIC_KEY,
  VLLM_URL: privateEnv.VLLM_URL,
  VLM_BASE_URL: privateEnv.VLM_BASE_URL,
  WHISPER_DEVICE: privateEnv.WHISPER_DEVICE,
  WHISPER_MODEL: privateEnv.WHISPER_MODEL,
  WHISPER_PATH: privateEnv.WHISPER_PATH,
  WHISPER_SERVER_URL: privateEnv.WHISPER_SERVER_URL,
  WHISPER_USE_SERVER: parseBoolean(privateEnv.WHISPER_USE_SERVER, false),
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
