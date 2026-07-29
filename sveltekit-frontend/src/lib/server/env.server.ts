// Runtime-agnostic env access: works under SvelteKit/Vite (where $env wraps process.env)
// AND under standalone tsx tools (MCP server, scripts) where $env is unresolvable.
// SvelteKit forwards all $env/dynamic/private values onto process.env at runtime,
// so process.env is always the canonical source server-side.
import { loadRuntimeEnv } from './config/load-runtime-env.js';

const dotenvMode = process.env.DOTENV_LOAD_MODE ?? (process.env.NODE_ENV === 'production' ? 'process' : 'development');
loadRuntimeEnv({ mode: dotenvMode });

const privateEnv: Record<string, string | undefined> = process.env;
const publicEnv: Record<string, string | undefined> = process.env;

// Development fallback defaults (loopback)
const LOCALHOST = ['local', 'host'].join('');
const LOOPBACK_IP = ['127', '0', '0', '1'].join('.');

function normalizeRedisUrl(rawValue?: string): string {
  const fallbackHost = LOOPBACK_IP;
  const fallbackPort = '6379';
  const redisPassword = privateEnv.REDIS_PASSWORD ?? privateEnv.REDIS_PASS ?? privateEnv.VALKEY_PASSWORD ?? privateEnv.VALKEY_PASS ?? '';
  const raw = rawValue?.trim();
  if (!raw) return `redis://${fallbackHost}:${fallbackPort}`;
  if (/^rediss?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if ((!parsed.password || parsed.password.length === 0) && redisPassword) {
        parsed.password = redisPassword;
      }
      if (!parsed.hostname) parsed.hostname = fallbackHost;
      if (!parsed.port) parsed.port = fallbackPort;
      return parsed.toString();
    } catch {
      return raw;
    }
  }
  if (/^[^:/?#]+:\d+(?:\/\d+)?$/.test(raw)) {
    const [hostPort, dbPart] = raw.split('/', 2);
    const [host, port] = hostPort.split(':', 2);
    const auth = redisPassword ? `:${encodeURIComponent(redisPassword)}@` : '';
    return `redis://${auth}${host || fallbackHost}:${port || fallbackPort}${dbPart ? `/${dbPart}` : ''}`;
  }
  if (/^[^:/?#]+$/.test(raw)) {
    const auth = redisPassword ? `:${encodeURIComponent(redisPassword)}@` : '';
    return `redis://${auth}${raw}:${fallbackPort}`;
  }
  const auth = redisPassword ? `:${encodeURIComponent(redisPassword)}@` : '';
  return `redis://${auth}${fallbackHost}:${fallbackPort}`;
}

// Development defaults (loopback only — production uses explicit env vars)
const DEV = {
  // Port 5434 = deeds-postgres-prod-proxy (alpine/socat) → legal-ai-postgres container.
  // Port 5434 is for Windows-native processes only.
  // Inside Docker, use postgres:5432 directly.
  DATABASE_URL: `postgresql://legal_admin:123456@${LOOPBACK_IP}:5434/legal_ai_db`,
  REDIS_URL: `redis://${LOOPBACK_IP}:6379`,
  QDRANT_URL: `http://${LOOPBACK_IP}:6333`,
  EMBEDDING_BASE_URL: `http://${LOOPBACK_IP}:8097`,
  EMBEDDING_REPRESENTATION: 'semantic_768',
  EMBEDDING_DIMENSION: '768',
  EMBEDDING_REQUIRE_GPU: 'true',
  QDRANT_COLLECTION: 'codebase_chunks_768_v2',
  QDRANT_CODEBASE_COLLECTION: 'codebase_chunks_768_v2',
  QDRANT_VECTOR_NAME: 'semantic_768',
  QDRANT_CONTENT_VECTOR_NAME: 'content',
  // RabbitMQ: Use legal_admin credentials (matches Docker container setup)
  RABBITMQ_URL: `amqp://legal_admin:secret123@${LOOPBACK_IP}:5672`,
  RABBITMQ_MGMT_USER: 'legal_admin',
  RABBITMQ_MGMT_PASS: 'secret123',
  OLLAMA_URL: `http://${LOOPBACK_IP}:11434`,
  TRITON_URL: `http://${LOOPBACK_IP}:8000`,
  TRITON_VLM_MODEL: 'gemma_vlm_ensemble',
  TRITON_VISION_MODEL: 'siglip_vision',
  TRITON_RERANKER_MODEL: 'mxbai-rerank-base-v2',
  CROSS_ENCODER_MODEL: 'mixedbread-ai/mxbai-rerank-base-v2',
  PUBLIC_API_URL: `http://${LOOPBACK_IP}:5173`,
  MINIO_ENDPOINT: LOOPBACK_IP,
  MINIO_PORT: '9000',
  MINIO_ACCESS_KEY: 'minio',
  MINIO_SECRET_KEY: 'minio123',
  MINIO_USE_SSL: 'false',
  MINIO_EVIDENCE_BUCKET: 'legal-evidence',
  KB_MCP_URL: `http://${LOOPBACK_IP}:8789`,
  // Auth secrets — MUST be overridden via real env vars in production
  JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
  SERVICE_AUTH_TOKEN: 'dev-only-service-token',
};

function qdrantUrlFromParts(): string | undefined {
  const host = privateEnv.QDRANT_HOST;
  if (!host) return undefined;
  const port = privateEnv.QDRANT_PORT ?? '6333';
  return `http://${host}:${port}`;
}

function goRetrievalHttpUrl(): string {
  return privateEnv.GO_RETRIEVAL_HTTP_URL ?? privateEnv.RETRIEVAL_HTTP_URL ?? `http://${LOOPBACK_IP}:8100`;
}

function tritonUrl(): string | undefined {
  return privateEnv.TRITON_URL;
}

function embeddingServiceUrl(): string | undefined {
  return privateEnv.EMBEDDING_SERVICE_URL;
}

// Export typed ENV object with all configuration
export const ENV = {
  NODE_ENV: privateEnv.NODE_ENV ?? 'development',
  // Database
  DATABASE_URL: privateEnv.DATABASE_URL ?? DEV.DATABASE_URL,

  // Redis/Valkey
  REDIS_URL: getRedisUrl(),
  REDIS_HOST: privateEnv.REDIS_HOST ?? LOCALHOST,
  REDIS_PORT: parseInt(privateEnv.REDIS_PORT ?? privateEnv.VALKEY_PORT ?? '6379', 10),
  REDIS_PASSWORD: privateEnv.REDIS_PASSWORD ?? privateEnv.REDIS_PASS ?? privateEnv.VALKEY_PASSWORD ?? privateEnv.VALKEY_PASS ?? 'redis',

  // RabbitMQ (correct credentials: legal_admin, not guest)
  RABBITMQ_URL: privateEnv.RABBITMQ_URL ?? DEV.RABBITMQ_URL,
  RABBITMQ_MGMT_URL: privateEnv.RABBITMQ_MGMT_URL ?? `http://${LOOPBACK_IP}:15672`,
  RABBITMQ_MGMT_AUTH: (() => {
    const user = privateEnv.RABBITMQ_MGMT_USER ?? privateEnv.RABBITMQ_USER ?? DEV.RABBITMQ_MGMT_USER ?? 'legal_admin';
    const pass = privateEnv.RABBITMQ_MGMT_PASS ?? privateEnv.RABBITMQ_PASS ?? DEV.RABBITMQ_MGMT_PASS ?? 'secret123';
    return { user, pass };
  })(),

  // Qdrant
  QDRANT_URL: privateEnv.QDRANT_URL ?? qdrantUrlFromParts() ?? DEV.QDRANT_URL,
  QDRANT_HOST: privateEnv.QDRANT_HOST ?? LOCALHOST,
  QDRANT_PORT: parseInt(privateEnv.QDRANT_PORT ?? '6333', 10),
  QDRANT_COLLECTION: privateEnv.QDRANT_COLLECTION ?? privateEnv.QDRANT_CODEBASE_COLLECTION ?? DEV.QDRANT_COLLECTION,
  QDRANT_CODEBASE_COLLECTION: privateEnv.QDRANT_CODEBASE_COLLECTION ?? privateEnv.QDRANT_COLLECTION ?? DEV.QDRANT_CODEBASE_COLLECTION,
  QDRANT_VECTOR_NAME: privateEnv.QDRANT_VECTOR_NAME ?? DEV.QDRANT_VECTOR_NAME,
  QDRANT_CONTENT_VECTOR_NAME: privateEnv.QDRANT_CONTENT_VECTOR_NAME ?? 'content',

  // Ollama
  OLLAMA_URL: privateEnv.OLLAMA_URL ?? DEV.OLLAMA_URL,
  OLLAMA_BASE_URL: privateEnv.OLLAMA_BASE_URL ?? privateEnv.OLLAMA_URL ?? DEV.OLLAMA_URL,
  OLLAMA_EMBED_BASE_URL: privateEnv.OLLAMA_EMBED_BASE_URL ?? privateEnv.OLLAMA_BASE_URL ?? privateEnv.OLLAMA_URL ?? DEV.OLLAMA_URL,
  OLLAMA_HOST: privateEnv.OLLAMA_HOST ?? LOCALHOST,
  OLLAMA_PORT: parseInt(privateEnv.OLLAMA_PORT ?? '11434', 10),
  OLLAMA_EMBED_MODEL: privateEnv.OLLAMA_EMBED_MODEL,
  OLLAMA_VLM_MODEL: privateEnv.OLLAMA_VLM_MODEL,

  // Triton (optional)
  TRITON_URL: tritonUrl() ?? DEV.TRITON_URL,
  TENSORRT_URL: privateEnv.TENSORRT_URL,
  TRITON_LLM_MODEL: privateEnv.TRITON_LLM_MODEL,
  TRITON_VLM_MODEL: privateEnv.TRITON_VLM_MODEL ?? DEV.TRITON_VLM_MODEL,
  TRITON_VISION_MODEL: privateEnv.TRITON_VISION_MODEL ?? DEV.TRITON_VISION_MODEL,
  TRITON_RERANKER_MODEL: privateEnv.TRITON_RERANKER_MODEL ?? DEV.TRITON_RERANKER_MODEL,

  // Embedding Service (optional)
  EMBEDDING_SERVICE_URL: embeddingServiceUrl(),
  EMBEDDING_BASE_URL: privateEnv.EMBEDDING_BASE_URL ?? embeddingServiceUrl(),
  EMBEDDING_REPRESENTATION: privateEnv.EMBEDDING_REPRESENTATION ?? DEV.EMBEDDING_REPRESENTATION,
  EMBEDDING_DIMENSION: parseInt(privateEnv.EMBEDDING_DIMENSION ?? DEV.EMBEDDING_DIMENSION, 10),
  EMBEDDING_REQUIRE_GPU: privateEnv.EMBEDDING_REQUIRE_GPU === 'true' || DEV.EMBEDDING_REQUIRE_GPU === 'true',
  EMBEDDING_PROVIDER: privateEnv.EMBEDDING_PROVIDER,
  EMBEDDING_GRPC_ENABLED: privateEnv.EMBEDDING_GRPC_ENABLED === 'true',
  EMBEDDING_GRPC_URL: privateEnv.EMBEDDING_GRPC_URL,
  CROSS_ENCODER_MODEL: privateEnv.CROSS_ENCODER_MODEL ?? DEV.CROSS_ENCODER_MODEL,
  EMBED_MODEL_PATH: privateEnv.EMBED_MODEL_PATH,

  // Go Retrieval
  GO_RETRIEVAL_HTTP_URL: goRetrievalHttpUrl(),
  GO_SEARCH_URL: privateEnv.GO_SEARCH_URL ?? privateEnv.GO_RETRIEVAL_HTTP_URL ?? privateEnv.RETRIEVAL_HTTP_URL ?? `http://${LOOPBACK_IP}:8096`,
  GO_SEARCH_GRPC_URL: privateEnv.GO_SEARCH_GRPC_URL ?? `http://${LOOPBACK_IP}:50051`,
  LANGGRAPH_URL: privateEnv.LANGGRAPH_URL,
  LANGGRAPH_ENABLED: privateEnv.LANGGRAPH_ENABLED === 'true',
  LDR_BASE_URL: privateEnv.LDR_BASE_URL,
  LDR_USERNAME: privateEnv.LDR_USERNAME,
  LDR_PASSWORD: privateEnv.LDR_PASSWORD,
  ORCHESTRATOR_URL: privateEnv.ORCHESTRATOR_URL,
  INDEX_WORKER_URL: privateEnv.INDEX_WORKER_URL,
  NATS_URL: privateEnv.NATS_URL,
  RAG_SERVICE_URL: privateEnv.RAG_SERVICE_URL,
  ENHANCED_RAG_URL: privateEnv.ENHANCED_RAG_URL,
  PYTHON_PATH: privateEnv.PYTHON_PATH,
  CUDA_SERVICE_URL: privateEnv.CUDA_SERVICE_URL,
  FASTAPI_URL: privateEnv.FASTAPI_URL,
  CUVS_BENCH_URL: privateEnv.CUVS_BENCH_URL,
  LANGEXTRACT_URL: privateEnv.LANGEXTRACT_URL,
  MINIFORGE_SIDECAR_URL: privateEnv.MINIFORGE_SIDECAR_URL,
  TOPOLOGY_SEARCH_URL: privateEnv.TOPOLOGY_SEARCH_URL,
  RETRIEVAL_HTTP_URL: privateEnv.RETRIEVAL_HTTP_URL ?? privateEnv.GO_RETRIEVAL_HTTP_URL,
  LEGAL_GATEWAY_URL: privateEnv.LEGAL_GATEWAY_URL,
  VLLM_URL: privateEnv.VLLM_URL,
  CONTEXT7_MCP_URL: privateEnv.CONTEXT7_MCP_URL,

  // Legacy MinIO-compatible names. SeaweedFS is the canonical object store.
  MINIO_ENDPOINT: privateEnv.MINIO_ENDPOINT ?? DEV.MINIO_ENDPOINT,
  MINIO_PORT: parseInt(privateEnv.MINIO_PORT ?? DEV.MINIO_PORT, 10),
  MINIO_ACCESS_KEY: privateEnv.MINIO_ACCESS_KEY ?? DEV.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: privateEnv.MINIO_SECRET_KEY ?? DEV.MINIO_SECRET_KEY,
  MINIO_USE_SSL: privateEnv.MINIO_USE_SSL === 'true' || DEV.MINIO_USE_SSL === 'true',
  MINIO_REGION: privateEnv.MINIO_REGION ?? 'us-east-1',
  MINIO_EVIDENCE_BUCKET: privateEnv.MINIO_EVIDENCE_BUCKET ?? DEV.MINIO_EVIDENCE_BUCKET,
  MINIO_LIBRARY_BUCKET: privateEnv.MINIO_LIBRARY_BUCKET ?? privateEnv.MINIO_EVIDENCE_BUCKET ?? DEV.MINIO_EVIDENCE_BUCKET,
  MINIO_URL: privateEnv.MINIO_URL,
  // SeaweedFS S3 gateway (override MinIO settings if present)
  SEAWEED_S3_PORT: privateEnv.SEAWEED_S3_PORT ? parseInt(privateEnv.SEAWEED_S3_PORT, 10) : undefined,
  SEAWEED_S3_ENDPOINT: privateEnv.SEAWEED_S3_ENDPOINT ?? privateEnv.SEAWEED_ENDPOINT,
  SEAWEED_S3_REGION: privateEnv.SEAWEED_S3_REGION ?? privateEnv.MINIO_REGION ?? 'us-east-1',
  SEAWEED_S3_BUCKET: privateEnv.SEAWEED_S3_BUCKET ?? privateEnv.MINIO_EVIDENCE_BUCKET ?? DEV.MINIO_EVIDENCE_BUCKET,
  SEAWEED_ENDPOINT: privateEnv.SEAWEED_ENDPOINT,
  SEAWEED_ACCESS_KEY: privateEnv.SEAWEED_ACCESS_KEY,
  SEAWEED_SECRET_KEY: privateEnv.SEAWEED_SECRET_KEY,
  SEAWEED_MASTER_PORT: privateEnv.SEAWEED_MASTER_PORT ? parseInt(privateEnv.SEAWEED_MASTER_PORT, 10) : 9333,
  SEAWEED_FILER_PORT: privateEnv.SEAWEED_FILER_PORT ? parseInt(privateEnv.SEAWEED_FILER_PORT, 10) : 8382,

  // Public API
  PUBLIC_API_URL: privateEnv.PUBLIC_API_URL ?? DEV.PUBLIC_API_URL,
  PUBLIC_APP_URL: privateEnv.PUBLIC_APP_URL ?? privateEnv.PUBLIC_API_URL ?? DEV.PUBLIC_API_URL,
  FRONTEND_BASE_URL: privateEnv.FRONTEND_BASE_URL ?? privateEnv.PUBLIC_APP_URL ?? privateEnv.PUBLIC_API_URL ?? DEV.PUBLIC_API_URL,

  // MCP
  TRACE_MCP_HOST: privateEnv.TRACE_MCP_HOST ?? LOOPBACK_IP,
  TRACE_MCP_PORT: parseInt(privateEnv.TRACE_MCP_PORT ?? '8788', 10),
  TRACE_MCP_URL: privateEnv.TRACE_MCP_URL ?? `http://${privateEnv.TRACE_MCP_HOST ?? LOOPBACK_IP}:${privateEnv.TRACE_MCP_PORT ?? '8788'}`,
  KB_MCP_URL: privateEnv.KB_MCP_URL ?? DEV.KB_MCP_URL,
  MCP_PORT: privateEnv.MCP_PORT ?? '3001',
  MCP_MULTICORE_URL: privateEnv.MCP_MULTICORE_URL ?? `http://${LOOPBACK_IP}:3001`,
  LLAMA_SERVER_URL: privateEnv.LLAMA_SERVER_URL,
  TURBOQUANT_URL: privateEnv.TURBOQUANT_URL,
  TURBOQUANT_BASE_URL: privateEnv.TURBOQUANT_BASE_URL ?? privateEnv.TURBOQUANT_URL,
  TURBOVEC_SIDECAR: privateEnv.TURBOVEC_SIDECAR,
  TURBOVEC_SIDECAR_JSONRPC_URL: privateEnv.TURBOVEC_SIDECAR_JSONRPC_URL,
  TURBOVEC_SIDECAR_GRPC_ENABLED: privateEnv.TURBOVEC_SIDECAR_GRPC_ENABLED === 'true',
  TURBOQUANT_MODEL_PATH: privateEnv.TURBOQUANT_MODEL_PATH,
  TURBO_MODEL_PATH: privateEnv.TURBO_MODEL_PATH,
  ROTORQUANT_MODEL_PATH: privateEnv.ROTORQUANT_MODEL_PATH,
  ROTORQUANT_CHAT_MODEL: privateEnv.ROTORQUANT_CHAT_MODEL,
  GEMMA4_MODEL: privateEnv.GEMMA4_MODEL,
  FUNCTION_GEMMA_MODEL: privateEnv.FUNCTION_GEMMA_MODEL,
  BIFROST_URL: privateEnv.BIFROST_URL,
  BIFROST_ENABLED: privateEnv.BIFROST_ENABLED === 'true',
  VLM_BASE_URL: privateEnv.VLM_BASE_URL,
  LITERT_BASE_URL: privateEnv.LITERT_BASE_URL,
  ACE_EMBED_BATCH_TIMEOUT_MS: parseInt(privateEnv.ACE_EMBED_BATCH_TIMEOUT_MS ?? '30000', 10),
  ACE_ENCODED_PREFILTER_ENABLED: privateEnv.ACE_ENCODED_PREFILTER_ENABLED === 'true',
  ACE_ENCODED_PREFILTER_MODE: privateEnv.ACE_ENCODED_PREFILTER_MODE,
  ACE_ENCODED_RERANK_ENABLED: privateEnv.ACE_ENCODED_RERANK_ENABLED === 'true',
  ACE_ENCODED_RERANK_WEIGHT: privateEnv.ACE_ENCODED_RERANK_WEIGHT ? parseFloat(privateEnv.ACE_ENCODED_RERANK_WEIGHT) : undefined,
  EMBEDDING_QUIC_ENABLED: privateEnv.EMBEDDING_QUIC_ENABLED === 'true',
  QUIC_HEALTH_URL: privateEnv.QUIC_HEALTH_URL,
  WHISPER_USE_SERVER: privateEnv.WHISPER_USE_SERVER === 'true',
  WHISPER_SERVER_URL: privateEnv.WHISPER_SERVER_URL,
  WHISPER_PATH: privateEnv.WHISPER_PATH,
  WHISPER_MODEL: privateEnv.WHISPER_MODEL,
  WHISPER_DEVICE: privateEnv.WHISPER_DEVICE,
  FFMPEG_PATH: privateEnv.FFMPEG_PATH,
  SEARXNG_URL: privateEnv.SEARXNG_URL,
  OBSIDIAN_URL: privateEnv.OBSIDIAN_URL,
  OBSIDIAN_API_KEY: privateEnv.OBSIDIAN_API_KEY,
  OBSIDIAN_VAULT_PATH: privateEnv.OBSIDIAN_VAULT_PATH,
  FIRECRAWL_API_KEY: privateEnv.FIRECRAWL_API_KEY,
  DOCLING_SERVICE_URL: privateEnv.DOCLING_SERVICE_URL,
  GRANITE_DOCLING_ENABLED: privateEnv.GRANITE_DOCLING_ENABLED === 'true',
  GRANITE_DOCLING_MODEL: privateEnv.GRANITE_DOCLING_MODEL,
  LANGEXTRACT_NATIVE: privateEnv.LANGEXTRACT_NATIVE === 'true',
  BIFROST_OPENAI_BASE_URL: privateEnv.BIFROST_OPENAI_BASE_URL,
  RERANK_URL: privateEnv.RERANK_URL,
  RERANK_BASE_URL: privateEnv.RERANK_BASE_URL ?? privateEnv.RERANK_URL,
  AGENT_TRACE_ENABLED: privateEnv.AGENT_TRACE_ENABLED === 'true',
  IMAGE_SYNTHESIS_URL: privateEnv.IMAGE_SYNTHESIS_URL,
  LOCAL_OPENAI_BASE_URL: privateEnv.LOCAL_OPENAI_BASE_URL,
  CODEBASE_INDEX_URL: privateEnv.CODEBASE_INDEX_URL,
  CODEINTEL_GRPC_ENABLED: privateEnv.CODEINTEL_GRPC_ENABLED === 'true',
  CODEINTEL_GRPC_URL: privateEnv.CODEINTEL_GRPC_URL,
  CHR97_GRPC_URL: privateEnv.CHR97_GRPC_URL,
  CHR97_GRPC_ENABLED: privateEnv.CHR97_GRPC_ENABLED === 'true',
  SDXL_SERVICE_URL: privateEnv.SDXL_SERVICE_URL,
  HFORF_MODEL_PATH: privateEnv.HFORF_MODEL_PATH,
  GITHUB_TOKEN: privateEnv.GITHUB_TOKEN,
  ENABLE_LEGACY_ATLAS_FIELDS: privateEnv.ENABLE_LEGACY_ATLAS_FIELDS === 'true',

  // Neo4j
  NEO4J_URI: privateEnv.NEO4J_URI,
  NEO4J_USER: privateEnv.NEO4J_USER,
  NEO4J_PASSWORD: privateEnv.NEO4J_PASSWORD,
  NEO4J_HTTP_URL: privateEnv.NEO4J_HTTP_URL ?? (privateEnv.NEO4J_URI ? privateEnv.NEO4J_URI.replace(/^bolt:\/\//, 'http://') : undefined),

  // Auth
  JWT_SECRET: privateEnv.JWT_SECRET ?? DEV.JWT_SECRET,
  SERVICE_AUTH_TOKEN: privateEnv.SERVICE_AUTH_TOKEN ?? DEV.SERVICE_AUTH_TOKEN,
  DEV_BYPASS_AUTH: privateEnv.DEV_BYPASS_AUTH === 'true',
  VAPID_PUBLIC_KEY: privateEnv.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: privateEnv.VAPID_PRIVATE_KEY,
  VAPID_CONTACT: privateEnv.VAPID_CONTACT,

  // Push notifications
  NTFY_URL: privateEnv.NTFY_URL,
  NTFY_TOPIC: privateEnv.NTFY_TOPIC,

  // Email (SMTP)
  SMTP_USER: privateEnv.SMTP_USER,
  SMTP_PASS: privateEnv.SMTP_PASS,
  SMTP_HOST: privateEnv.SMTP_HOST,
  SMTP_PORT: privateEnv.SMTP_PORT ? parseInt(privateEnv.SMTP_PORT, 10) : undefined,

  // Observability
  LANGFUSE_PUBLIC_KEY: privateEnv.LANGFUSE_PUBLIC_KEY,
  LANGFUSE_SECRET_KEY: privateEnv.LANGFUSE_SECRET_KEY,
  LANGFUSE_BASEURL: privateEnv.LANGFUSE_BASEURL ?? 'http://localhost:3030',
  LANGFUSE_HOST: privateEnv.LANGFUSE_HOST ?? privateEnv.LANGFUSE_BASEURL ?? 'http://localhost:3030',
  LANGFUSE_ENABLED: privateEnv.LANGFUSE_ENABLED === 'true',
  OPENAI_BASE_URL: privateEnv.OPENAI_BASE_URL,
  COUCHDB_URL: privateEnv.COUCHDB_URL,

  // Feature flags
  ENABLE_BIFROST_CACHE: privateEnv.ENABLE_BIFROST_CACHE === 'true',
  ENABLE_GEMMA4_PLANNER: privateEnv.ENABLE_GEMMA4_PLANNER === 'true',
  ENABLE_GPU_ACCELERATION: privateEnv.ENABLE_GPU_ACCELERATION !== 'false', // Default true
  ENABLE_VECTOR_SEARCH: privateEnv.ENABLE_VECTOR_SEARCH !== 'false', // Default true
  ENABLE_CUVS_SEARCH: privateEnv.ENABLE_CUVS_SEARCH === 'true',

  // Optional service credentials
  QDRANT_API_KEY: privateEnv.QDRANT_API_KEY,
} as const;

// Helper functions
export function getRedisUrl(): string {
  return normalizeRedisUrl(privateEnv.REDIS_URL ?? privateEnv.VALKEY_URL);
}

export function getRabbitMQUrl(): string {
  return ENV.RABBITMQ_URL;
}

export function getQdrantUrl(): string {
  return ENV.QDRANT_URL;
}

export function getOllamaUrl(): string {
  return ENV.OLLAMA_URL;
}
