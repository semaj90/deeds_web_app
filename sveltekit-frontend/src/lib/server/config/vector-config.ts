/**
 * Vector Configuration — Single Source of Truth
 *
 * ALL vector-related config lives here:
 * - Collection names (canonical — used by QdrantManager + qdrant-health)
 * - Vector dimensions (768 = embeddinggemma native)
 * - HNSW index parameters (Qdrant + pgvector)
 * - Quantization config (INT8 scalar)
 * - Distance metrics
 * - Service URLs (ENV-backed)
 * - Batch/performance tuning
 *
 * Model: embeddinggemma:latest (768 dimensions native)
 */
import { ENV } from '$lib/server/env.server.js';

export const VECTOR_CONFIG = {
  MODEL: 'embeddinggemma:latest',
  DIMENSIONS: 768,

  DISTANCE_METRIC: {
    POSTGRES: 'vector_cosine_ops',
    QDRANT: 'Cosine',
    // Note: FAISS is NOT used — Qdrant + pgvector are the only active vector stores
  },

  INDEX: {
    HNSW_M: 16,
    HNSW_EF_CONSTRUCTION: 64,
    HNSW_EF_SEARCH: 40,
    QDRANT_ON_DISK: true,
    QDRANT_HNSW_M: 16,
    QDRANT_HNSW_EF: 128,
  },

  /** Canonical Qdrant collection names — alias → actual name */
  COLLECTIONS: {
    documents: 'legal_documents',
    cases: 'legal_cases',
    evidence: 'evidence_items',
    chat_history: 'chat_messages',
    embeddings_cache: 'embedding_cache',
    document_tags: 'document_tags',
    topic_clusters: 'topic_clusters',
    llm_cache: 'llm_response_cache',
    poi_profiles: 'poi_profiles',
    legal_canon_chunks: 'legal_canon_chunks',
    fictional_case_chunks: 'fictional_case_chunks',
    codebase_chunks: 'codebase_chunks_768',
    error_embeddings: 'error_embeddings',
    diagnosis_embeddings: 'diagnosis_embeddings',
  },

  /** Per-collection vector schema (vector name → used by health checks + init) */
  COLLECTION_VECTORS: {
    legal_documents: { vectors: ['content'], on_disk_payload: true },
    legal_cases: { vectors: ['description'] },
    evidence_items: { vectors: ['content'], on_disk_payload: true },
    chat_messages: { vectors: ['message'] },
    embedding_cache: { vectors: ['embedding'] },
    document_tags: { vectors: ['default'] },
    topic_clusters: { vectors: ['default'] },
    llm_response_cache: { vectors: ['query'] },
    poi_profiles: { vectors: ['default'] },
    legal_canon_chunks: { vectors: ['content'], on_disk_payload: true },
    fictional_case_chunks: { vectors: ['content'], on_disk_payload: true },
    codebase_chunks_768: { vectors: ['content', 'signature'], on_disk_payload: true },
    error_embeddings: { vectors: ['error'], on_disk_payload: true },
    diagnosis_embeddings: { vectors: ['diagnosis'], on_disk_payload: true },
  },

  /** Qdrant HNSW config applied to all collections */
  QDRANT_HNSW: { m: 16, ef_construct: 200 },

  /** INT8 scalar quantization — ~4x compression, minimal recall loss */
  QDRANT_QUANTIZATION: {
    scalar: { type: 'int8' as const, quantile: 0.99, always_ram: false },
  },

  DOCKER_SERVICES: {
    QDRANT_URL: ENV.QDRANT_URL,
    POSTGRES_URL: ENV.DATABASE_URL,
    OLLAMA_URL: ENV.OLLAMA_BASE_URL,
    REDIS_URL: ENV.REDIS_URL,
  },

  BATCH_SIZE: {
    EMBEDDING_GENERATION: 100,
    DATABASE_INSERT: 1000,
    SEARCH_LIMIT: 50,
  },

  PERFORMANCE: {
    ENABLE_CACHE: true,
    CACHE_TTL_SECONDS: 3600,
    PARALLEL_REQUESTS: 4,
    TIMEOUT_MS: 30000,
  },
} as const;

// Type exports
export type VectorDistanceMetric = (typeof VECTOR_CONFIG.DISTANCE_METRIC)[keyof typeof VECTOR_CONFIG.DISTANCE_METRIC];
export type CollectionAlias = keyof typeof VECTOR_CONFIG.COLLECTIONS;
export type CollectionName = (typeof VECTOR_CONFIG.COLLECTIONS)[CollectionAlias];

export function validateVectorDimensions(vector: number[]): boolean {
	return vector.length === VECTOR_CONFIG.DIMENSIONS;
}

export function checkVectorEnvironment(): {
	postgres: boolean;
	qdrant: boolean;
	ollama: boolean;
	redis: boolean;
} {
	return {
		postgres: !!process.env.DATABASE_URL,
		qdrant: !!process.env?.QDRANT_URL || !!process.env.QDRANT_HOST,
		ollama: !!process.env.OLLAMA_URL,
		redis: !!process.env?.REDIS_URL || (!!process.env?.REDIS_HOST && !!process.env.REDIS_PORT),
	};
}

export function getVectorConfigSummary(): string {
	return `--- Vector Summary ---
Model: ${VECTOR_CONFIG.MODEL}
Dimensions: ${VECTOR_CONFIG.DIMENSIONS}
Metric: ${VECTOR_CONFIG.DISTANCE_METRIC.QDRANT}
HNSW M: ${VECTOR_CONFIG.INDEX.HNSW_M}
Batch Size (Embedding Generation): ${VECTOR_CONFIG.BATCH_SIZE.EMBEDDING_GENERATION}

--- Services ---
PostgreSQL: ${VECTOR_CONFIG.DOCKER_SERVICES.POSTGRES_URL}
Qdrant: ${VECTOR_CONFIG.DOCKER_SERVICES.QDRANT_URL}
Ollama: ${VECTOR_CONFIG.DOCKER_SERVICES.OLLAMA_URL}
Redis: ${VECTOR_CONFIG.DOCKER_SERVICES.REDIS_URL}

--- Collections (${Object.keys(VECTOR_CONFIG.COLLECTIONS).length}) ---
${Object.entries(VECTOR_CONFIG.COLLECTIONS)
	.map(([alias, name]) => ` - ${alias}: ${name}`)
	.join('\n')}
--------------------
`.trim();
}
