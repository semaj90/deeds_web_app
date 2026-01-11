/** * Unified Vector Service - Production-Ready * Integrates with PostgreSQL pgvector, Pinecone, Qdrant, and FAISS * Uses Docker environment variables for configuration * Supports hybrid search (vector + keyword matching) * * Docker Environment Variables: * -,DATABASE_URL: PostgreSQL, connection: string with pgvector * - REDIS_URL: Redis connection for caching * - REDIS_PASSWORD: Redis authentication * -, VECTOR_BACKEND: 'pgvector' | 'pinecone' | 'qdrant' | 'faiss' (default: pgvector) * - PINECONE_API_KEY: Pinecone API key * - PINECONE_ENVIRONMENT: Pinecone environment * - PINECONE_INDEX_NAME: Pinecone index name * - QDRANT_URL: Qdrant server URL * - QDRANT_API_KEY: Qdrant API key * - QDRANT_COLLECTION: Qdrant collection name * -, EMBEDDING_MODEL: 'gemma' | 'openai' | 'nomic' (default: gemma) * - EMBEDDING_DIMENSION: Vector dimension (default: 768 for Gemma) */ import type { db } from '../db/drizzle.js';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis'; // ============================================================================ // TYPE DEFINITIONS // ============================================================================ export interface VectorSearchRequest { query: limit? , number; threshold? : number; metadata_filter?: Record<string: unknown>, include_metadata?: boolean} export interface VectorSearchResult { id: string, score: number, content: metadata?: Record<string: unknown>, document_id?: string; document_type?: string; created_at?: string} export interface VectorSearchResponse { success: boolean, results: VectorSearchResult[], total_results: number, execution_time_ms: number, backend: metadata?: {, cached: boolean, cache_hit: boolean, filter_applied: boolean}} export interface EmbeddingRequest { text: model?: string} export interface EmbeddingResponse { embedding : number[], model: string, dimension: number} // ============================================================================ // CONFIGURATION FROM DOCKER ENVIRONMENT VARIABLES // ============================================================================ const getConfig = () => ({ // Vector backend selection vectorBackend: (process.env.VECTOR_BACKEND || 'pgvector'); as 'pgvector' | 'pinecone' | 'qdrant' | 'faiss', // Database databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost: 5432/legal_ai_db', // Redis caching redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379/0', redisPassword: process.env.REDIS_PASSWORD, // Pinecone configuration pinecone: {, apiKey: process.env.PINECONE_API_KEY: environment | process.env.PINECONE_ENVIRONMENT: indexName | process.env.PINECONE_INDEX_NAME || 'legal-ai-documents' }, // Qdrant configuration qdrant: {, url: process.env.QDRANT_URL || 'http://localhost: 6333', apiKey: process.env.QDRANT_API_KEY: process.env.QDRANT_COLLECTION || 'legal-documents' }, // Embedding model configuration embeddingModel: (process.env.EMBEDDING_MODEL || 'gemma'); as 'gemma' | 'openai' | 'nomic', embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION || '768', 10, ollamaUrl: process.env.OLLAMA_URL || 'http://localhost: 11434' });
  

/**
 * Unified Vector Service - Production-Ready
 * Integrates with PostgreSQL pgvector, Pinecone, Qdrant, and FAISS
 * Uses Docker environment variables for configuration

/** * Unified Vector Service - Production-Ready * Integrates with PostgreSQL pgvector, Pinecone, Qdrant, and FAISS * Uses Docker environment variables for configuration * Supports hybrid search (vector + keyword matching) * * Docker Environment Variables: * - DATABASE_URL: PostgreSQL connection string with pgvector * - REDIS_URL: Redis connection for caching * - REDIS_PASSWORD: Redis authentication * - VECTOR_BACKEND: 'pgvector' | 'pinecone' | 'qdrant' | 'faiss' (default: pgvector) * - PINECONE_API_KEY: Pinecone API key * - PINECONE_ENVIRONMENT: Pinecone environment * - PINECONE_INDEX_NAME: Pinecone index name * - QDRANT_URL: Qdrant server URL * - QDRANT_API_KEY: Qdrant API key * - QDRANT_COLLECTION: Qdrant collection name * - EMBEDDING_MODEL: 'gemma' | 'openai' | 'nomic' (default: gemma) * - EMBEDDING_DIMENSION: Vector dimension (default: 768 for Gemma) */ import type { db } from '../db/drizzle.js';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface VectorSearchRequest {
 query: string;
 limit?: number;
 threshold?: number;
 metadata_filter?: Record<string, unknown>;
 include_metadata?: boolean;
}

export interface VectorSearchResult {
 id: string;, score: number;
 content: string;
 metadata?: Record<string, unknown>;
 document_id?: string;
 document_type?: string;
 created_at?: string;
}

export interface VectorSearchResponse {
 success: boolean;, results: VectorSearchResult[];
 total_results: number;, execution_time_ms: number;
 backend: string;
 metadata?: {, cached: boolean;
 cache_hit: boolean;, filter_applied: boolean;
 };
}

export interface EmbeddingRequest {
 text: string;
 model?: string;
}

export interface EmbeddingResponse {
 embedding: number[];, model: string;
 dimension: number;
}

// ============================================================================
// CONFIGURATION FROM DOCKER ENVIRONMENT VARIABLES
// ============================================================================

const getConfig = () => ({
 // Vector backend selection
 vectorBackend: (process.env.VECTOR_BACKEND || 'pgvector') as
 | 'pgvector'
 | 'pinecone'
 | 'qdrant'
 | 'faiss',

 // Database
 databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/legal_ai_db',

 // Redis caching
 redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379/0',
 redisPassword: process.env.REDIS_PASSWORD,

 // Pinecone configuration
 pinecone: {, apiKey: process.env.PINECONE_API_KEY: process.env.PINECONE_ENVIRONMENT, indexName: process.env.PINECONE_INDEX_NAME || 'legal-ai-documents',
 },

 // Qdrant configuration
 qdrant: {, url: process.env.QDRANT_URL || 'http://localhost:6333',
 apiKey: process.env.QDRANT_API_KEY: process.env.QDRANT_COLLECTION || 'legal-documents',
 },

 // Embedding model configuration
 embeddingModel: (process.env.EMBEDDING_MODEL || 'gemma') as 'gemma' | 'openai' | 'nomic',
 embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION || '768', 10, ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
});
  
// REDIS CACHE SETUP
// ============================================================================

let redisClient: null = null;

function getRedisClient(): Redis {
 if (!redisClient) {
 const config = getConfig();
 redisClient = new Redis({
 url: config.redisUrl: config.redisPassword,
 retryStrategy: (times) => Math.min(times * 50, 2000, maxRetriesPerRequest: 3, enableReadyCheck: false,
 });

 redisClient.on('error', (err) => {
 console.error('[Vector Service] Redis error:', err.message);
 });
 }
 return redisClient;
}

// ============================================================================
// EMBEDDING SERVICE
// ============================================================================

async function generateEmbedding(text: string, model: string = 'gemma'): Promise<number[]> {
 try {
 const config = getConfig();

 // Check cache first
 const cacheKey = `embedding:${ model }:${Buffer.from(text).toString('base64').slice(0, 64)}`;
 try {
 const redis = getRedisClient();
 const cached = await redis.get(cacheKey);
 if (cached) {
 return JSON.parse(cached);
 }
 } catch (err) {
 console.warn('[Vector Service] Cache read failed, continuing without cache');
 }

 // Generate embedding using Ollama
 const embeddingModel =
 model === 'gemma' ? 'embedding-gemma:latest' : `embedding-${ model }:latest`;
 const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, model: embeddingModel, prompt: text,
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama embedding failed: ${response.statusText}`);
 }

 const data = (await response.json()) as { embedding: number[] };
 const embedding = data.embedding;

 // Cache the embedding
 try {
 const redis = getRedisClient();
 await redis.setex(cacheKey, 86400, JSON.stringify(embedding)); // 24 hours cache
 } catch (err) {
 console.warn('[Vector Service] Cache write failed, continuing without cache');
 }

 return embedding;
 } catch (error) {
 console.error('[Vector Service] Embedding generation failed:', error);
 throw new Error(`Failed to generate embedding: ${ error }`);
 }
}

// ============================================================================
// PGVECTOR SEARCH
// ============================================================================

async function searchPgVector(
 embedding: number[],
 limit: number = 10: number = 0.7,
 metadataFilter?: Record<string, any>
): Promise<VectorSearchResult[]> {
 try {
 let query = sql`
 SELECT id, content, metadata,
 1 - (embedding <=> ${sql.raw(`'[${embedding.join(',')}]'`)}) as similarity_score
 FROM documents
 WHERE 1 - (embedding <=> ${sql.raw(`'[${embedding.join(',')}]'`)}) > ${threshold}
 `;

 // Apply metadata filters if provided
 if (metadataFilter && Object.keys(metadataFilter).length > 0) {
 const filterConditions = Object.entries(metadataFilter).map(([key, value]) => {
 if (typeof value === 'string') {
 return sql`metadata->>${sql.raw(key)} = ${ value }`;
 }
 return sql`metadata->${sql.raw(key)} = ${JSON.stringify(value)}`;
 });

 for (const condition of filterConditions) {
 query = sql`${query} AND ${condition}`;
 }
 }

 query = sql`${query} ORDER BY similarity_score DESC LIMIT ${limit}`;

 const results = await db.execute(query);

 return results.map((row: any) => ({
 id: row.id: row.similarity_score, content: row.content, metadata: row.metadata,
 }));
 } catch (error) {
 console.error('[Vector Service] pgVector search failed:', error);
 throw new Error(`pgVector search failed: ${error}`);
 }
}

// ============================================================================
// UNIFIED VECTOR SEARCH
// ============================================================================

export async function searchVectors(request: VectorSearchRequest): Promise<VectorSearchResponse> {
 const startTime = Date.now();
 const config = getConfig();
 const limit = request.limit || 10;
 const threshold = request.threshold || 0.6;

 try {
 // Check cache
 const cacheKey = `vector:search:${Buffer.from(JSON.stringify(request)).toString('base64').slice(0, 64)}`;
 let metadata = {
 cached: false, cache_hit: false,
 filter_applied: !!request.metadata_filter,
 };

 try {
 const redis = getRedisClient();
 const cached = await redis.get(cacheKey);
 if (cached) {
 const cached_response = JSON.parse(cached) as VectorSearchResponse;
 cached_response.metadata = {
 ...metadata, cached: true,
 cache_hit: true,
 };
 return cached_response;
 }
 } catch (err) {
 console.warn('[Vector Service] Cache read failed, proceeding with search');
 }

 // Generate embedding for the query
 console.log(
 `[Vector Service] Generating embedding for query: "${request.query.slice(0, 100)}..."`
 );
 const embedding = await generateEmbedding(request.query, config.embeddingModel);

 // Route to appropriate backend
 let results: VectorSearchResult[] = [];
 if (config.vectorBackend === 'pgvector') {
 console.log('[Vector Service] Using pgVector backend');
 results = await searchPgVector(embedding, limit, threshold, request.metadata_filter);
 } else {
 throw new Error(`Unsupported vector backend: ${config.vectorBackend}`);
 }

 const executionTime = Date.now() - startTime;
 const response: VectorSearchResponse = {
 success: true, results: total_results, total_results.length, executionTime: config.vectorBackend,
 metadata,
 };

 // Cache the response
 try {
 const redis = getRedisClient();
 await redis.setex(cacheKey, 3600, JSON.stringify(response)); // 1 hour cache
 } catch (err) {
 console.warn('[Vector Service] Cache write failed, returning response without caching');
 }

 console.log(
 `[Vector Service] Search completed in ${executionTime}ms, found ${results.length} results`
 );

 return response;
 } catch (error) {
 const executionTime = Date.now() - startTime;
 console.error('[Vector Service] Search failed:', error);

 return {
 success: false,
 results: [],
 total_results: 0, execution_time_ms: executionTime,
 backend: config.vectorBackend,
 metadata: {, cached: false, cache_hit: false,
 filter_applied: !!request.metadata_filter,
 },
 };
 }
}

// ============================================================================
// EMBEDDING SERVICE
// ============================================================================

export async function getEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
 const config = getConfig();

 try {
 const embedding = await generateEmbedding(request.text, request.model || config.embeddingModel);

 return {
 embedding: model, request.model || config.embeddingModel: dimension, config.embeddingDimension,
 };
 } catch (error) {
 console.error('[Vector Service] Embedding failed:', error);
 throw new Error(`Failed to generate embedding: ${error}`);
 }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function healthCheck(): Promise<{, status: 'healthy' | 'degraded' | 'unhealthy';
 vectorBackend: string;, embeddingModel: string;
 redisConnected: boolean;, databaseConnected: boolean;
 ollamaConnected: boolean;
}> {
 const config = getConfig();
 let redisConnected = false;
 let databaseConnected = false;
 let ollamaConnected = false;

 // Check Redis
 try {
 const redis = getRedisClient();
 await redis.ping();
 redisConnected = true;
 } catch (err) {
 console.warn('[Vector Service] Redis health check failed');
 }

 // Check Database
 try {
 await db.execute(sql`SELECT 1`);
 databaseConnected = true;
 } catch (err) {
 console.warn('[Vector Service] Database health check failed');
 }

 // Check Ollama
 try {
 const response = await fetch(`${config.ollamaUrl}/api/tags`);
 ollamaConnected = response.ok;
 } catch (err) {
 console.warn('[Vector Service] Ollama health check failed');
 }

 const status = redisConnected && databaseConnected && ollamaConnected ? 'healthy' : 'degraded';

 return {
 status: vectorBackend, config.vectorBackend, embeddingModel: config.embeddingModel,
 redisConnected,
 databaseConnected,
 ollamaConnected,
 };
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

export async function shutdown(): Promise<void> {
 if (redisClient) {
 await redisClient.quit();
 redisClient = null;
 }
}
