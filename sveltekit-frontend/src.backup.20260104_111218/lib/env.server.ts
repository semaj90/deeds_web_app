import { z } from 'zod';

const EnvSchema = z.object({
	// Database
	DATABASE_URL: z.string().url(),
	DIRECT_URL: z.string().url().optional(),

	// Redis
	REDIS_URL: z.string(),
	REDIS_PASSWORD: z.string(),

	// AI Services
	OLLAMA_URL: z.string().url(),
	CUDA_SERVICE_URL: z.string().url().optional(),
	TENSORRT_SERVICE_URL: z.string().url().optional(),

	// Qdrant
	QDRANT_URL: z.string().url(),

	// Auth & Security
	JWT_SECRET: z.string().min(32),
	SESSION_SECRET: z.string().min(32),
	AUTH_COOKIE_NAME: z.string().default('legal_ai_session'),

	// MinIO / Object Storage
	MINIO_ACCESS_KEY: z.string(),
	MINIO_SECRET_KEY: z.string(),
	MINIO_ENDPOINT: z.string().optional(),
	MINIO_BUCKET: z.string().default('legal-documents'),

	// Docker (optional - for local development)
	DOCKER_HOST: z.string().optional(),
	DOCKER_TLS_VERIFY: z.string().optional(),
	DOCKER_CERT_PATH: z.string().optional(),

	// API Keys (optional - only if using external services)
	OPENAI_API_KEY: z.string().optional(),
	ANTHROPIC_API_KEY: z.string().optional(),
	DEEPSEEK_API_KEY: z.string().optional()
});

// Parse and validate environment variables at startup
// This will throw if any required vars are missing or invalid
export const env = EnvSchema.parse(process.env);

// Type-safe environment access
export type Env = z.infer<typeof EnvSchema>;

