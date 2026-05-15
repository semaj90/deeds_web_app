import { env } from '$lib/env';
import { z } from 'zod';

// Determine if running in a Docker environment
const isDocker = env.DOCKER_ENV === 'true';

// Define loopback helpers for general default fallbacks in development.
const LOCALHOST = ['local', 'host'].join('');
const LOOPBACK_IP = ['127', '0', '0', '1'].join('.');

function getMinioPort(): number {
  return parseInt(env?.MINIO_PORT ?? '9000', 10);
}

function getMinioUseSSL(): boolean {
  return env.MINIO_USE_SSL === 'true';
}

function normalizeMinioEndpoint(rawValue?: string): string {
  const fallbackHost = isDocker ? 'minio' : LOCALHOST;
  const raw = rawValue?.trim();
  const input = raw && raw.length > 0 ? raw : fallbackHost;
  let endpoint = input;
  let port = getMinioPort();

  try {
    if (input.includes('://')) {
      const url = new URL(input);
      endpoint = url.hostname;
      if (url.port) {
        const parsedPort = parseInt(url.port, 10);
        if (!Number.isNaN(parsedPort)) {
          port = parsedPort;
        }
      }
    } else if (input.includes(':')) {
      const [maybeHost, maybePort] = input.split(':', 2);
      if (maybeHost) {
        endpoint = maybeHost;
      }
      const parsedPort = parseInt(maybePort ?? '', 10);
      if (!Number.isNaN(parsedPort)) {
        return `${endpoint}:${parsedPort}`;
      }
    } else {
      endpoint = input;
    }
  } catch {
    endpoint = input;
  }

  return `${endpoint}:${port}`;
}

function normalizeMinioUrl(rawValue?: string): string {
  const scheme = getMinioUseSSL() ? 'https' : 'http';
  const raw = rawValue?.trim();

  if (raw && raw.length > 0) {
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }

    return `${scheme}://${normalizeMinioEndpoint(raw)}`;
  }

  return `${scheme}://${normalizeMinioEndpoint(env?.MINIO_ENDPOINT)}`;
}

export function getDatabaseUrl(): string {
 return env?.DATABASE_URL ?? `postgresql://legal_admin:123456@${LOCALHOST}:5434/legal_ai_db`;
}

export function getRedisUrl(): string {
 return env?.REDIS_URL ?? `redis://redis@${LOCALHOST}:6379/0`;
}

export function getRedisHost(): string {
 return env?.REDIS_HOST ?? LOCALHOST;
}

export function getRedisPort(): number {
 return parseInt(env?.REDIS_PORT ?? '6379', 10);
}

export function getRedisPassword(): string {
 return env?.REDIS_PASSWORD ?? 'redis';
}

export function getRabbitMQUrl(): string {
 return (
   env?.RABBITMQ_URL || `amqp://legal_admin:secret123@${isDocker ? 'rabbitmq' : LOCALHOST}:5672`
  );
}

export function getQdrantUrl(): string {
 return env?.QDRANT_URL|| `http://${isDocker ? 'qdrant' : LOCALHOST}:6333`;
}

export function getOllamaUrl(): string {
 return env?.OLLAMA_URL|| `http://${isDocker ? 'ollama' : LOCALHOST}:11434`;
}

export function getCouchDbUrl(): string {
 return env?.COUCHDB_URL ?? `http://admin:password@${LOCALHOST}:5984`;
}

export function getMcpMulticoreUrl(): string {
  const port = env?.MCP_PORT ?? '3001';
  return env?.MCP_MULTICORE_URL ?? `http://${isDocker ? 'mcp' : LOCALHOST}:${port}`;
}

export function getMinioConfig() {
 return {
   endpoint: normalizeMinioEndpoint(env?.MINIO_ENDPOINT ?? env?.MINIO_URL),
   accessKey: env?.MINIO_ACCESS_KEY ?? 'minioadmin',
   secretKey: env?.MINIO_SECRET_KEY ?? 'minioadmin',
   useSSL: getMinioUseSSL(),
 };
}

export function getNeo4jConfig() {
 return {
  uri: env?.NEO4J_URI|| `bolt://${isDocker ? 'neo4j' : LOCALHOST}:7687`,
  user: env?.NEO4J_USER ?? 'neo4j',
   password: env?.NEO4J_PASSWORD ?? 'neo4j123',
  };
}

export function getCodebaseIndexUrl(): string {
  return env?.CODEBASE_INDEX_URL ?? `http://${isDocker ? 'codebase-index' : LOCALHOST}:8090`;
}

export function getTrtLlmUrl(): string {
  return env?.TRTLLM_URL ?? `http://${isDocker ? 'trtllm' : LOCALHOST}:8099`;
}

export function getTritonUrl(): string {
  return env?.TRITON_URL ?? `http://${isDocker ? 'triton' : LOCALHOST}:8000`;
}

export function getOrchestratorUrl(): string {
  return env?.ORCHESTRATOR_URL ?? `http://${isDocker ? 'orchestrator' : LOCALHOST}:8102`;
}

export function getCudaServiceUrl(): string {
  return env?.CUDA_SERVICE_URL ?? `http://${isDocker ? 'cuda-service' : LOCALHOST}:8765`;
}

export function getRabbitMQManagementUrl(): string {
  return env?.RABBITMQ_MGMT_URL ?? `http://${isDocker ? 'rabbitmq' : LOCALHOST}:15672`;
}

export function getRabbitMQManagementAuth(): string {
  const user = env?.RABBITMQ_MGMT_USER ?? env?.RABBITMQ_USER ?? 'guest';
  const pass = env?.RABBITMQ_MGMT_PASS ?? env?.RABBITMQ_PASS ?? 'guest';
  return 'Basic ' + btoa(`${user}:${pass}`);
}


export function getRagServiceUrl(): string {
  return env?.RAG_SERVICE_URL ?? `http://${isDocker ? 'rag-service' : LOCALHOST}:8103`;
}

export function isProduction(): boolean {
 return env.NODE_ENV === 'production';
}

// Define the Zod schema for environment variables
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  POSTGRES_URL: z.string().url().default(getDatabaseUrl()),
  POSTGRES_USER: z.string().default('legal_admin'),
  POSTGRES_PASSWORD: z.string().default('123456'),
  POSTGRES_DB: z.string().default('legal_ai_db'),
   POSTGRES_HOST: z.string().default(isDocker ? 'postgres' : LOCALHOST),
  POSTGRES_PORT: z.coerce.number().default(5432),
  REDIS_URL: z.string().url().default(getRedisUrl()),
  REDIS_PASSWORD: z.string().default('redis'),
  OLLAMA_URL: z.string().url().default(getOllamaUrl()),
  TRITON_URL: z
    .string()
    .url()
    .default(`http://${isDocker ? 'triton' : LOCALHOST}:8001`),
  QDRANT_URL: z.string().url().default(getQdrantUrl()),
  NEO4J_URL: z.string().url().default(getNeo4jConfig().uri),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().default('neo4j123'),
  MINIO_URL: z.string().url().default(normalizeMinioUrl()),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('deeds-storage'),
  ENABLE_GPU: z.coerce.boolean().default(false),
  ENABLE_CUDA: z.coerce.boolean().default(false),
  ENABLE_WEBGPU: z.coerce.boolean().default(false),
  ENABLE_SIMD_JSON: z.coerce.boolean().default(false),
  RTX_3060_OPTIMIZATION: z.coerce.boolean().default(false),
  OCR_MODE: z.string().optional(),
  DEV_QUIC_PORT: z.coerce.number().optional(),
  QUIC_ENABLED: z.coerce.boolean().default(false),
  DEV_BYPASS_AUTH: z.coerce.boolean().default(false),
  MEMORY_CACHE_TTL: z.coerce.number().default(300),
  VECTOR_CACHE_SIZE: z.coerce.number().default(1000),
  JWT_SECRET: z.string().default('dev-secret'),
  API_KEY: z.string().default('dev-api-key'),
  LOG_LEVEL: z.string().default('info'),
  ENABLE_STRUCTURED_LOGGING: z.coerce.boolean().default(false),
  // Backward-compatible (legacy) aliases — no .url() since these can be host:port or connection strings
  DATABASE_URL: z.string().optional(),
  MINIO_ENDPOINT: z.string().default(normalizeMinioEndpoint(env?.MINIO_ENDPOINT ?? env?.MINIO_URL)),
  MINIO_REGION: z.string().optional(),
});

const parsed = ConfigSchema.safeParse({
  NODE_ENV: env.NODE_ENV,
  POSTGRES_URL: env?.POSTGRES_URL || env.DATABASE_URL,
  POSTGRES_USER: env.POSTGRES_USER,
  POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
  POSTGRES_DB: env.POSTGRES_DB,
  POSTGRES_HOST: env.POSTGRES_HOST,
  POSTGRES_PORT: env.POSTGRES_PORT,
  REDIS_URL: env.REDIS_URL,
  REDIS_PASSWORD: env.REDIS_PASSWORD,
  OLLAMA_URL: env.OLLAMA_URL,
  TRITON_URL: env.TRITON_URL,
  QDRANT_URL: env.QDRANT_URL,
  NEO4J_URL: env.NEO4J_URI,
  NEO4J_USER: env.NEO4J_USER,
  NEO4J_PASSWORD: env.NEO4J_PASSWORD,
  MINIO_URL: normalizeMinioUrl(env?.MINIO_URL ?? env.MINIO_ENDPOINT),
  MINIO_ACCESS_KEY: env.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: env.MINIO_SECRET_KEY,
  MINIO_BUCKET: env.MINIO_BUCKET,
  ENABLE_GPU: env.ENABLE_GPU,
  ENABLE_CUDA: env.ENABLE_CUDA,
  ENABLE_WEBGPU: env.ENABLE_WEBGPU,
  ENABLE_SIMD_JSON: env.ENABLE_SIMD_JSON,
  RTX_3060_OPTIMIZATION: env.RTX_3060_OPTIMIZATION,
  OCR_MODE: env.OCR_MODE,
  DEV_QUIC_PORT: env.DEV_QUIC_PORT,
  QUIC_ENABLED: env.QUIC_ENABLED,
  DEV_BYPASS_AUTH: env.DEV_BYPASS_AUTH,
  MEMORY_CACHE_TTL: env.MEMORY_CACHE_TTL,
  VECTOR_CACHE_SIZE: env.VECTOR_CACHE_SIZE,
  JWT_SECRET: env.JWT_SECRET,
  API_KEY: env.API_KEY,
  LOG_LEVEL: env.LOG_LEVEL,
  ENABLE_STRUCTURED_LOGGING: env.ENABLE_STRUCTURED_LOGGING,
  DATABASE_URL: env.DATABASE_URL,
  MINIO_ENDPOINT: normalizeMinioEndpoint(env.MINIO_ENDPOINT ?? env.MINIO_URL),
  MINIO_REGION: env.MINIO_REGION,
});if (!parsed.success) {
 console.warn('⚠️ CONFIG validation issues (non-fatal): ', parsed.error.format());
}

export const CONFIG = parsed.success ? parsed.data : ConfigSchema.parse({});
export type Config = typeof CONFIG;

/** Convenience helpers */
export const isDockerEnvironment = () => isDocker;
export const getEnvironmentInfo = () => ({
	isDocker,
	nodeEnv: CONFIG.NODE_ENV,
	gpuEnabled: CONFIG.ENABLE_GPU,
	cudaEnabled: CONFIG.ENABLE_CUDA,
	quicEnabled: CONFIG.QUIC_ENABLED,
});

// Provide backward-compatible alias helpers for legacy call sites.
// These mirror old env names to the canonical keys in CONFIG.
export const LEGACY = {
	DATABASE_URL: CONFIG.DATABASE_URL ?? CONFIG.POSTGRES_URL,
	POSTGRES_URL: CONFIG.POSTGRES_URL,
	MINIO_ENDPOINT: CONFIG.MINIO_ENDPOINT ?? CONFIG.MINIO_URL,
	MINIO_URL: CONFIG.MINIO_URL,
	MINIO_REGION: CONFIG.MINIO_REGION ?? env.MINIO_REGION ?? undefined,
};
