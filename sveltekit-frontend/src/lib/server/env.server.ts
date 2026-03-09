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
	// gRPC services
	EMBEDDING_GRPC_URL: privateEnv.EMBEDDING_GRPC_URL ?? '127.0.0.1:50051',
	EMBEDDING_GRPC_ENABLED: (privateEnv.EMBEDDING_GRPC_ENABLED ?? 'false') === 'true',
	RETRIEVAL_GRPC_URL: privateEnv.RETRIEVAL_GRPC_URL ?? '127.0.0.1:50053',
	RETRIEVAL_GRPC_ENABLED: (privateEnv.RETRIEVAL_GRPC_ENABLED ?? 'false') === 'true',
	// SIMD sidecar (Go minio-simd-service)
	MINIO_SIMD_ENABLED: (privateEnv.MINIO_SIMD_ENABLED ?? 'false') === 'true',
	MINIO_SIMD_URL: privateEnv.MINIO_SIMD_URL ?? 'http://127.0.0.1:8095',
	// QUIC/NATS embedding transport
	EMBEDDING_QUIC_ENABLED: (privateEnv.EMBEDDING_QUIC_ENABLED ?? privateEnv.QUIC_ENABLED ?? 'false') === 'true',
	NATS_URL: privateEnv.NATS_URL ?? 'nats://127.0.0.1:4222',
	// TensorRT-LLM inference (primary, port 8000 from existing container)
	TENSORRT_URL: privateEnv.TENSORRT_URL ?? privateEnv.TENSORRT_SERVICE_URL ?? 'http://localhost:8000',
	// Neo4j graph database
	NEO4J_URI: privateEnv.NEO4J_URI ?? privateEnv.NEO4J_URL ?? 'bolt://localhost:7687',
	NEO4J_USER: privateEnv.NEO4J_USER ?? privateEnv.NEO4J_USERNAME ?? 'neo4j',
	NEO4J_PASSWORD: privateEnv.NEO4J_PASSWORD ?? privateEnv.NEO4J_PASS ?? 'password',
	// CouchDB document store
	COUCHDB_URL: privateEnv.COUCHDB_URL ?? 'http://admin:password@localhost:5984',
	// Web Search APIs (optional — falls back to curated results)
	SEARXNG_URL: privateEnv.SEARXNG_URL ?? '', // Free self-hosted: http://localhost:8080 or public instance
	GOOGLE_SEARCH_API_KEY: privateEnv.GOOGLE_SEARCH_API_KEY ?? '',
	GOOGLE_SEARCH_CX: privateEnv.GOOGLE_SEARCH_CX ?? '',
	// FastAPI middleware (optional)
	FASTAPI_URL: privateEnv.FASTAPI_URL ?? 'http://localhost:8001',
	// Web Push (VAPID) — generate with: npx web-push generate-vapid-keys --json
	VAPID_PUBLIC_KEY: publicEnv.PUBLIC_VAPID_KEY ?? privateEnv.VAPID_PUBLIC_KEY ?? 'BNtj-Ymwzc6FbcwSeJ46GL2yKLAqMMGj0sDeDPhnQZ3-pbG05UhbUxcZ89q0m7S4bKzEEG5aE-P2WEkCO8DJZ8U',
	VAPID_PRIVATE_KEY: privateEnv.VAPID_PRIVATE_KEY ?? 'MuusRYO6dkldyhXG_123RBWTB1OhY0pUkA9lkuCZCK8',
	VAPID_CONTACT: privateEnv.VAPID_CONTACT ?? 'mailto:admin@deeds-legal.ai',
	// ntfy.sh push notifications
	NTFY_URL: privateEnv.NTFY_URL ?? 'https://ntfy.sh',
	NTFY_TOPIC: privateEnv.NTFY_TOPIC ?? 'deeds-legal-alerts',
	// Email (Nodemailer — Gmail SMTP or custom)
	SMTP_HOST: privateEnv.SMTP_HOST ?? 'smtp.gmail.com',
	SMTP_PORT: Number(privateEnv.SMTP_PORT ?? '587'),
	SMTP_USER: privateEnv.SMTP_USER ?? '',
	SMTP_PASS: privateEnv.SMTP_PASS ?? '',
	SMTP_FROM: privateEnv.SMTP_FROM ?? 'Deeds Legal AI <noreply@deeds-legal.ai>',
};
