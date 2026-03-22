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
  // LangExtract legal section extraction (phase66-langextract container)
  LANGEXTRACT_URL:
    privateEnv.LANGEXTRACT_URL ?? privateEnv.LANGEXTRACT_API_URL ?? 'http://127.0.0.1:8095',
  // QUIC/NATS embedding transport
  EMBEDDING_QUIC_ENABLED:
    (privateEnv.EMBEDDING_QUIC_ENABLED ?? privateEnv.QUIC_ENABLED ?? 'false') === 'true',
  NATS_URL: privateEnv.NATS_URL ?? 'nats://127.0.0.1:4222',
  // TensorRT-LLM inference (primary, port 8000 from existing container)
  TENSORRT_URL:
    privateEnv.TENSORRT_URL ?? privateEnv.TENSORRT_SERVICE_URL ?? 'http://localhost:8000',
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
  // Go Legal Library Search Service (parallel fan-out: citation + FTS + pgvector + Qdrant)
  GO_SEARCH_URL: privateEnv.GO_SEARCH_URL ?? '',
  GO_SEARCH_GRPC_URL: privateEnv.GO_SEARCH_GRPC_URL ?? '127.0.0.1:50055',
  // QUIC server health endpoint (Go microservice on :8095)
  QUIC_HEALTH_URL: privateEnv.QUIC_HEALTH_URL ?? 'http://127.0.0.1:8095/health',
  // FastAPI middleware (optional)
  FASTAPI_URL: privateEnv.FASTAPI_URL ?? 'http://localhost:8001',
  // Web Push (VAPID) — generate with: npx web-push generate-vapid-keys --json
  VAPID_PUBLIC_KEY: publicEnv.PUBLIC_VAPID_KEY ?? privateEnv.VAPID_PUBLIC_KEY ?? '',
  VAPID_PRIVATE_KEY: privateEnv.VAPID_PRIVATE_KEY ?? '',
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
  // Langfuse LLM observability (docker/langfuse.yml — port 3030)
  LANGFUSE_PUBLIC_KEY: privateEnv.LANGFUSE_PUBLIC_KEY ?? '',
  LANGFUSE_SECRET_KEY: privateEnv.LANGFUSE_SECRET_KEY ?? '',
  LANGFUSE_HOST: privateEnv.LANGFUSE_HOST ?? 'http://localhost:3030',
  LANGFUSE_ENABLED: (privateEnv.LANGFUSE_ENABLED ?? 'false') === 'true',
  // LiteLLM proxy (OpenAI-compatible gateway with semantic caching)
  LITELLM_URL: privateEnv.LITELLM_URL ?? 'http://localhost:4000',
  LITELLM_API_KEY: privateEnv.LITELLM_API_KEY ?? 'sk-deeds-litellm-2026',
  LITELLM_ENABLED: (privateEnv.LITELLM_ENABLED ?? 'false') === 'true',
  // Auth secrets
  JWT_SECRET: privateEnv.JWT_SECRET ?? DEV.JWT_SECRET,
  SERVICE_AUTH_TOKEN: privateEnv.SERVICE_AUTH_TOKEN ?? DEV.SERVICE_AUTH_TOKEN,
};
