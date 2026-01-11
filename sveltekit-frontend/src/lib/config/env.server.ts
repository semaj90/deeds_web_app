import { env } from '$lib/env';
import { z } from 'zod';

// Determine if running in a Docker environment
const isDocker = env.DOCKER_ENV === 'true';

// Define a host variable for general default fallbacks in development.
const host = 'localhost';

export function getDatabaseUrl(): string {
 return env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
}

export function getRedisUrl(): string {
 return env.REDIS_URL || 'redis://redis@localhost:6379/0';
}

export function getRedisHost(): string {
 return env.REDIS_HOST || 'localhost';
}

export function getRedisPort(): number {
 return parseInt(env.REDIS_PORT || '6379', 10);
}

export function getRedisPassword(): string {
 return env.REDIS_PASSWORD || 'redis';
}

export function getRabbitMQUrl(): string {
 return (
 env.RABBITMQ_URL || `amqp://legal_admin:123456@${isDocker ? 'rabbitmq' : 'localhost'}:5672`
 );
}

export function getQdrantUrl(): string {
 return env.QDRANT_URL || `http://${isDocker ? 'qdrant' : 'localhost'}:6333`;
}

export function getOllamaUrl(): string {
 return env.OLLAMA_URL || `http://${isDocker ? 'ollama' : 'localhost'}:11434`;
}

export function getCouchDbUrl(): string {
 return env.COUCHDB_URL || 'http://admin:password@localhost:5984';
}

export function getMinioConfig() {
 return {
 endpoint: env.MINIO_ENDPOINT || (isDocker ? 'minio:9000' : 'localhost:9000'),
 accessKey: env.MINIO_ACCESS_KEY || 'minioadmin',
 secretKey: env.MINIO_SECRET_KEY || 'minioadmin',
 useSSL: env.MINIO_USE_SSL === 'true',
 };
}

export function getNeo4jConfig() {
 return {
 uri: env.NEO4J_URI || `bolt://${isDocker ? 'neo4j' : 'localhost'}:7687`,
 user: env.NEO4J_USER || 'neo4j',
 password: env.NEO4J_PASSWORD || 'legal123456',
 };
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
 POSTGRES_HOST: z.string().default(isDocker ? 'postgres' : 'localhost'),
 POSTGRES_PORT: z.coerce.number().default(5432),
 REDIS_URL: z.string().url().default(getRedisUrl()),
 REDIS_PASSWORD: z.string().default('redis'),
 OLLAMA_URL: z.string().url().default(getOllamaUrl()),
 TRITON_URL: z
 .string()
 .url()
 .default(`http://${isDocker ? 'triton' : 'localhost'}:8001`),
 QDRANT_URL: z.string().url().default(getQdrantUrl()),
 NEO4J_URL: z.string().url().default(getNeo4jConfig().uri),
 NEO4J_USER: z.string().default('neo4j'),
 NEO4J_PASSWORD: z.string().default('legal123456'),
 MINIO_URL: z.string().url().default(`http://${getMinioConfig().endpoint}`),
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
 // Backward-compatible (legacy) aliases
 DATABASE_URL: z.string().url().optional(),
 MINIO_ENDPOINT: z.string().url().optional(),
 MINIO_REGION: z.string().optional(),
});

const parsed = ConfigSchema.safeParse({
	NODE_ENV: env.NODE_ENV,
	POSTGRES_URL: env.POSTGRES_URL || env.DATABASE_URL,
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
	MINIO_URL: (() => {
		const raw = env.MINIO_URL || env.MINIO_ENDPOINT;
		if (!raw) return undefined;
		// If already looks like a URL, return as-is
		if (/^https?:\/\//i.test(raw)) return raw;
		// If looks like host:port, prefix http:// for local/dev convenience
		if (/^[a-z0-9._-]+:\d+$/i.test(raw)) return `http://${raw}`;
		// Fallback: in non-production, prefix http://, in production: leave undefined to fail validation
		return env.NODE_ENV === 'production' ? raw : `http://${raw}`;
	})(),
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
	MINIO_ENDPOINT: env.MINIO_ENDPOINT,
	MINIO_REGION: env.MINIO_REGION,
});if (!parsed.success) {
 console.error('❌ CONFIG validation failed: ', parsed.error.format());
 throw new Error('Invalid environment configuration');
}

export const CONFIG = parsed.data;
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

