import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

// Development fallback defaults (localhost)
const DEV = {
	DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
	REDIS_URL: 'redis://localhost:6379',
	QDRANT_URL: 'http://localhost:6333',
	RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
	OLLAMA_URL: 'http://localhost:11434',
	PUBLIC_API_URL: 'http://localhost:5173',
	MINIO_ENDPOINT: 'localhost',
	MINIO_PORT: '9000',
	MINIO_ACCESS_KEY: 'admin',
	MINIO_SECRET_KEY: 'password',
	MINIO_USE_SSL: 'false',
	MINIO_EVIDENCE_BUCKET: 'legal-evidence',
};

function qdrantUrlFromParts(): string | undefined {
	const host = privateEnv.QDRANT_HOST;
	if (!host) return undefined;
	const port = privateEnv.QDRANT_PORT ?? '6333';
	return `http://${host}:${port}`;
}

export const ENV = {
	DATABASE_URL: privateEnv.DATABASE_URL ?? privateEnv.POSTGRES_URL ?? DEV.DATABASE_URL,
	REDIS_URL: privateEnv.REDIS_URL ?? DEV.REDIS_URL,
	QDRANT_URL: privateEnv.QDRANT_URL ?? qdrantUrlFromParts() ?? DEV.QDRANT_URL,
	RABBITMQ_URL: privateEnv.RABBITMQ_URL ?? DEV.RABBITMQ_URL,
	OLLAMA_BASE_URL: privateEnv.OLLAMA_BASE_URL ?? privateEnv.OLLAMA_URL ?? DEV.OLLAMA_URL,
	PUBLIC_API_URL: publicEnv.PUBLIC_API_URL ?? DEV.PUBLIC_API_URL,
	MINIO_ENDPOINT: privateEnv.MINIO_ENDPOINT ?? DEV.MINIO_ENDPOINT,
	MINIO_PORT: privateEnv.MINIO_PORT ?? DEV.MINIO_PORT,
	MINIO_ACCESS_KEY: privateEnv.MINIO_ACCESS_KEY ?? DEV.MINIO_ACCESS_KEY,
	MINIO_SECRET_KEY: privateEnv.MINIO_SECRET_KEY ?? DEV.MINIO_SECRET_KEY,
	MINIO_USE_SSL: privateEnv.MINIO_USE_SSL ?? DEV.MINIO_USE_SSL,
	MINIO_EVIDENCE_BUCKET: privateEnv.MINIO_EVIDENCE_BUCKET ?? DEV.MINIO_EVIDENCE_BUCKET,
};
