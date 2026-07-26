// Runtime-agnostic env access: works under SvelteKit/Vite (where $env wraps process.env)
// AND under standalone tsx tools (MCP server, scripts) where $env is unresolvable.
// SvelteKit forwards all $env/dynamic/private values onto process.env at runtime,
// so process.env is always the canonical source server-side.
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath: string, baseValues: Record<string, string> = {}): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const parsed = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    if (current === undefined || current === baseValues[key]) {
      process.env[key] = value;
    }
  }
  return parsed;
}

// Environment loading precedence (explicit mode-based — no automatic dotenv override in production)
function loadEnvironment(mode: 'development' | 'process' = 'process') {
  if (mode === 'development') {
    // Local development: .env.local overrides .env
    const envRoot = path.resolve(process.cwd(), '.env');
    const envLocal = path.resolve(process.cwd(), '.env.local');
    const rootValues = loadEnvFile(envRoot);
    loadEnvFile(envLocal, rootValues);
  }
  // 'process' mode: use process.env only (container/CI, respects mounted secrets)
}

// Default mode: 'process' (use environment as-is, no dotenv override)
// Set DOTENV_LOAD_MODE='development' to enable local .env.local precedence
const dotenvMode = process.env.DOTENV_LOAD_MODE ?? 'process';
loadEnvironment(dotenvMode as 'development' | 'process');

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
  // Port 5432 on the host is squatted by a native Windows Postgres install on this machine,
  // so any client connecting to :5432 hits a different DB. Always route through the proxy.
  DATABASE_URL: `postgresql://legal_admin:123456@${LOOPBACK_IP}:5434/legal_ai_db`,
  REDIS_URL: `redis://${LOOPBACK_IP}:6379`,
  QDRANT_URL: `http://${LOOPBACK_IP}:6333`,
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

  // Ollama
  OLLAMA_URL: privateEnv.OLLAMA_URL ?? DEV.OLLAMA_URL,
  OLLAMA_HOST: privateEnv.OLLAMA_HOST ?? LOCALHOST,
  OLLAMA_PORT: parseInt(privateEnv.OLLAMA_PORT ?? '11434', 10),

  // Triton (optional)
  TRITON_URL: tritonUrl() ?? DEV.TRITON_URL,
  TRITON_VLM_MODEL: privateEnv.TRITON_VLM_MODEL ?? DEV.TRITON_VLM_MODEL,
  TRITON_VISION_MODEL: privateEnv.TRITON_VISION_MODEL ?? DEV.TRITON_VISION_MODEL,
  TRITON_RERANKER_MODEL: privateEnv.TRITON_RERANKER_MODEL ?? DEV.TRITON_RERANKER_MODEL,

  // Embedding Service (optional)
  EMBEDDING_SERVICE_URL: embeddingServiceUrl(),
  CROSS_ENCODER_MODEL: privateEnv.CROSS_ENCODER_MODEL ?? DEV.CROSS_ENCODER_MODEL,

  // Go Retrieval
  GO_RETRIEVAL_HTTP_URL: goRetrievalHttpUrl(),

  // MinIO / SeaweedFS
  MINIO_ENDPOINT: privateEnv.MINIO_ENDPOINT ?? DEV.MINIO_ENDPOINT,
  MINIO_PORT: parseInt(privateEnv.MINIO_PORT ?? DEV.MINIO_PORT, 10),
  MINIO_ACCESS_KEY: privateEnv.MINIO_ACCESS_KEY ?? DEV.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: privateEnv.MINIO_SECRET_KEY ?? DEV.MINIO_SECRET_KEY,
  MINIO_USE_SSL: privateEnv.MINIO_USE_SSL === 'true' || DEV.MINIO_USE_SSL === 'true',
  MINIO_REGION: privateEnv.MINIO_REGION ?? 'us-east-1',
  MINIO_EVIDENCE_BUCKET: privateEnv.MINIO_EVIDENCE_BUCKET ?? DEV.MINIO_EVIDENCE_BUCKET,
  // SeaweedFS S3 gateway (override MinIO settings if present)
  SEAWEED_S3_PORT: privateEnv.SEAWEED_S3_PORT ? parseInt(privateEnv.SEAWEED_S3_PORT, 10) : undefined,
  SEAWEED_ENDPOINT: privateEnv.SEAWEED_ENDPOINT,
  SEAWEED_ACCESS_KEY: privateEnv.SEAWEED_ACCESS_KEY,
  SEAWEED_SECRET_KEY: privateEnv.SEAWEED_SECRET_KEY,
  SEAWEED_MASTER_PORT: privateEnv.SEAWEED_MASTER_PORT ? parseInt(privateEnv.SEAWEED_MASTER_PORT, 10) : 9333,
  SEAWEED_FILER_PORT: privateEnv.SEAWEED_FILER_PORT ? parseInt(privateEnv.SEAWEED_FILER_PORT, 10) : 8382,

  // Public API
  PUBLIC_API_URL: privateEnv.PUBLIC_API_URL ?? DEV.PUBLIC_API_URL,

  // MCP
  KB_MCP_URL: privateEnv.KB_MCP_URL ?? DEV.KB_MCP_URL,
  MCP_PORT: privateEnv.MCP_PORT ?? '3001',
  MCP_MULTICORE_URL: privateEnv.MCP_MULTICORE_URL ?? `http://${LOOPBACK_IP}:3001`,

  // Auth
  JWT_SECRET: privateEnv.JWT_SECRET ?? DEV.JWT_SECRET,
  SERVICE_AUTH_TOKEN: privateEnv.SERVICE_AUTH_TOKEN ?? DEV.SERVICE_AUTH_TOKEN,

  // Observability
  LANGFUSE_PUBLIC_KEY: privateEnv.LANGFUSE_PUBLIC_KEY,
  LANGFUSE_SECRET_KEY: privateEnv.LANGFUSE_SECRET_KEY,
  LANGFUSE_BASEURL: privateEnv.LANGFUSE_BASEURL ?? 'http://localhost:3030',

  // Feature flags
  ENABLE_BIFROST_CACHE: privateEnv.ENABLE_BIFROST_CACHE === 'true',
  ENABLE_GEMMA4_PLANNER: privateEnv.ENABLE_GEMMA4_PLANNER === 'true',
  ENABLE_GPU_ACCELERATION: privateEnv.ENABLE_GPU_ACCELERATION !== 'false', // Default true
  ENABLE_VECTOR_SEARCH: privateEnv.ENABLE_VECTOR_SEARCH !== 'false', // Default true
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
