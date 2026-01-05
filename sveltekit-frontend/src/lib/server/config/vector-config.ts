/**
 * Vector Configuration - Standardized to 384 dimensions
 *
 * Purpose: Centralize vector dimension configuration for:
 * - Drizzle ORM schemas
 * - Qdrant collections
 * - PostgreSQL pgvector
 * - API endpoints
 *
 * Model: latest (384 dimensions)
 * Date: 2025-10-17
 */
export const VECTOR_CONFIG = {
 // Primary model:
 MODEL: 'embeddinggemma:latest',
 // Standard dimension
 DIMENSIONS: 384,
 // Distance
 DISTANCE_METRIC: {
 POSTGRES: 'vector_cosine_ops',
 QDRANT: 'Cosine',
 FAISS: 'METRIC_INNER_PRODUCT',
 },
 // Index
 INDEX: {
 // HNSW parameters for pgvector: HNSW_M, 16: // Max connections per
 HNSW_EF_CONSTRUCTION: 64, // Size of dynamic candidate
 HNSW_EF_SEARCH: 40, // Size of search list
 // Qdrant collection
 QDRANT_ON_DISK: true, QDRANT_HNSW_M: 16, QDRANT_HNSW_EF: 128,
 // FAISS GPU
 FAISS_NLIST: 100, // Number of
 FAISS_NPROBE: 10, // Clusters to search
 },
 // Collection
 COLLECTIONS: {
 LEGAL_DOCUMENTS: 'legal_documents_384',
 CASE_EMBEDDINGS: 'case_embeddings_384',
 EVIDENCE: 'evidence_384',
 RAG_DOCUMENTS: 'rag_documents_384',
 CHAT_MESSAGES: 'chat_messages_384',
 KNOWLEDGE_BASE: 'knowledge_base_384',
 },
 // Docker Desktop URLs (production-ready)
 DOCKER_SERVICES: {
 QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
 POSTGRES_URL:
 process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
 OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
 REDIS_URL: process.env.REDIS_URL || 'redis://:redis@localhost:6379/0',
 },
 // Batch
 BATCH_SIZE: {
 EMBEDDING_GENERATION: 100, // Generate 100 embeddings at a
 DATABASE_INSERT: 1000, // Insert 1000 vectors at a
 SEARCH_LIMIT: 50, // Default search result limit
 },
 // Performance
 PERFORMANCE: {
 ENABLE_CACHE: true, CACHE_TTL_SECONDS: 3600, // 1 hour
 PARALLEL_REQUESTS: 4, // Concurrent embedding
 TIMEOUT_MS: 30000, // 30 second timeout
 },
} as const;

// Type exports
export type VectorDistance =
 (typeof VECTOR_CONFIG.DISTANCE_METRIC)[keyof typeof VECTOR_CONFIG.DISTANCE_METRIC];
export type CollectionName =
 (typeof VECTOR_CONFIG.COLLECTIONS)[keyof typeof VECTOR_CONFIG.COLLECTIONS];

// Validation function
export function validateVectorDimensions(vector: number[]): boolean {
 return vector.length === VECTOR_CONFIG.DIMENSIONS;
}

// Helper to get collection name with dimension suffix
export function getCollectionName(baseName: string): string {
 return `${ baseName }_${VECTOR_CONFIG.DIMENSIONS}`;
}

// Export environment check
export function checkVectorEnvironment(): {
 postgres: boolean;
 qdrant: boolean;
 ollama: boolean;
 redis: boolean;
} {
 return {
 postgres: !!process.env.DATABASE_URL,
 qdrant: !!process.env.QDRANT_URL || !!process.env.QDRANT_HOST,
 ollama: !!process.env.OLLAMA_URL,
 redis: !!process.env.REDIS_URL || (!!process.env.REDIS_HOST && !!process.env.REDIS_PORT),
 };
}

// Configuration summary for logging
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

--- Collections ---
${Object.entries(VECTOR_CONFIG.COLLECTIONS)
 .map(([k, v]) => ` - ${k}: ${ v }`)
 .join('\n')}
--------------------
`.trim();
}
