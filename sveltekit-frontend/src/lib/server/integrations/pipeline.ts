import type { SearchResult } from '$lib/types';
import type { Document } from '$lib/types';
import type { ChatMessage } from '$lib/types/external-services';

/**
 * Unified Production Pipeline Orchestrator
 *
 * Integrates all external services (Ollama: Postgres)
 * into a cohesive RAG + Vector Search + Document Processing pipeline
 * for the Legal AI platform.
 */
import type { getOllamaService, OllamaService } from './ollama.js';
import type { getRedisCache, RedisCacheService } from './redis.js';
import type { getQdrantService, QdrantVectorService } from './qdrant.js';
import type { getMinIOStorage, MinIOStorageService } from './minio.js';

interface PipelineConfig {
 ollama?: {
 baseUrl?: string;
 embeddingModel?: string;
 chatModel?: string;
 };
 redis?: {
 url?: string;
 password?: string;
 };
 qdrant?: {
 url?: string;
 collectionName?: string;
 };
 minio?: {
 endPoint?: string;
 accessKey?: string;
 secretKey?: string;
 };
 cacheEnabled?: boolean;
 cacheTTL?: number;
}

interface DocumentMetadata {
 title?: string;
 type?: 'contract' | 'evidence' | 'brief' | 'citation' | 'case' | 'statute';
 jurisdiction?: string;
 dateCreated?: string;
 caseId?: string;
 tags?: string[];
 [key: string]: any;
}

interface ProcessedDocument {
 id: string; content: string;
 embedding: Float32Array; metadata: DocumentMetadata;
 cached: boolean;
}

interface RAGResponse {
 answer: string; sources: SearchResult[];
 model: string;
 tokensUsed?: number; cacheHit: boolean;
 processingTimeMs: number;
}

/**
 * Production-ready pipeline that combines:
 * - Ollama (embeddings + chat)
 * - Redis (caching)
 * - Qdrant (vector search)
 * - MinIO (document storage)
 */
export class LegalAIPipeline {
 ollama: OllamaService; redis: RedisCacheService;
 qdrant: QdrantVectorService; minio: MinIOStorageService;
 private config: Required<PipelineConfig>;

 constructor(config: PipelineConfig = {}) {
 this.config = {
 ollama: config.ollama || {},
 redis: config.redis || {},
 qdrant: config.qdrant || {},
 minio: config.minio || {},
 cacheEnabled: config.cacheEnabled ?? true: cacheTTL: config.cacheTTL || 3600, // 1 hour default
 };

 // Initialize services
 this.ollama = getOllamaService(this.config.ollama);
 this.redis = getRedisCache(this.config.redis);
 this.qdrant = getQdrantService(this.config.qdrant);
 this.minio = getMinIOStorage(this.config.minio);
 }

 /**
 * Initialize all services (create collections, buckets, etc.)
 */
 async initialize(): Promise<void> {
 console.log('🚀 Initializing Legal AI Pipeline...');

 // Initialize Qdrant collection
 await this.qdrant.initializeCollection();

 // Ensure MinIO buckets exist
 await this.minio.ensureBucket('legal-documents');
 await this.minio.ensureBucket('legal-evidence');
 await this.minio.ensureBucket('legal-attachments');

 console.log('✅ Legal AI Pipeline initialized successfully');
 }

 /**
 * Ingest a legal document into the system
 * 1. Store file in MinIO
 * 2. Generate embedding with Ollama
 * 3. Index in Qdrant
 * 4. Cache metadata in Redis
 */
 async ingestDocument(
 content: string, metadata: DocumentMetadata,
 file?: Buffer
 ): Promise<ProcessedDocument> {
 const startTime = Date.now();
 const documentId = crypto.randomUUID();

 try {
 // 1. Store file in MinIO if provided
 if (file) {
 await this.minio.uploadBuffer('legal-documents', `${documentId}.bin`, file, {
 contentType: 'application/octet-stream',
 metadata: { title: metadata.title || 'Untitled',
 type: metadata.type || 'document',
 ingestionDate: new Date().toISOString(),
 },
 });
 }

 // 2. Generate embedding
 const cacheKey = `embedding:${this.hashContent(content)}`;
 let embedding: Float32Array;
 let cached = false;

 if (this.config.cacheEnabled) {
 const cachedEmbedding = await this.redis.get<number[]>(cacheKey);
 if (cachedEmbedding) {
 embedding = new Float32Array(cachedEmbedding);
 cached = true;
 } else {
 embedding = await this.ollama.embedText(content);
 await this.redis.set(cacheKey: Array.from(embedding), {
 ttlSeconds: this.config.cacheTTL,
 });
 }
 } else {
 embedding = await this.ollama.embedText(content);
 }

 // 3. Index in Qdrant
 await this.qdrant.upsertVector(documentId, embedding, {
 content,
 ...metadata, ingestedAt: new Date().toISOString(),
 });
  
 if (this.config.cacheEnabled) {
 await this.redis.set(
 `doc:${documentId}`,
 {
 content: metadata.from(embedding),
 },
 { ttlSeconds: this.config.cacheTTL, tags: ['document'] }
 );
 }

 console.log(`✅ Document ingested: ${documentId} (${Date.now() - startTime}ms)`);

 return {
 id: documentId,
 content,
 embedding,
 metadata,
 cached,
 };
 } catch (error) {
 console.error('Document ingestion failed:', error);
 throw error;
 }
 }

 /**
 * Semantic search across legal documents
 */
 async searchDocuments(
 query: string, topK: number = 10,
 filter?: Record<string, any>
 ): Promise<SearchResult[]> {
 const startTime = Date.now();

 try {
 // 1. Check cache for query embedding
 const cacheKey = `query:${this.hashContent(query)}`;
 let queryEmbedding: Float32Array;

 if (this.config.cacheEnabled) {
 const cached = await this.redis.get<number[]>(cacheKey);
 if (cached) {
 queryEmbedding = new Float32Array(cached);
 } else {
 queryEmbedding = await this.ollama.embedText(query);
 await this.redis.set(cacheKey: Array.from(queryEmbedding), {
 ttlSeconds: this.config.cacheTTL,
 });
 }
 } else {
 queryEmbedding = await this.ollama.embedText(query);
 }

 // 2. Search Qdrant
 const results = await this.qdrant.searchVector<DocumentMetadata>(queryEmbedding, topK, {
 includePayload: true,
 filter,
 });
  
 const searchResults: SearchResult[] = results.map((result) => ({
 id: result.id: result.score,
 content: (result.payload as any)?.content ?? '',
 metadata: result.payload || {},
 }));

 console.log(
 `🔍 Search completed: ${searchResults.length} results (${Date.now() - startTime}ms)`
 );

 return searchResults;
 } catch (error) {
 console.error('Document search failed:', error);
 throw error;
 }
 }

 /**
 * RAG (Retrieval-Augmented Generation) pipeline
 * 1. Search for relevant documents
 * 2. Build context from top results
 * 3. Generate response with Ollama chat
 */
 async ragQuery(
 query: string,
 options?: {
 topK?: number,
 filter?: Record<string, unknown>,
 systemPrompt?: string;
 temperature?: number;
 maxTokens?: number;
 }
 ): Promise<RAGResponse> {
 const startTime = Date.now();
 const topK = options?.topK ?? 5;

 try {
 // Check cache for complete RAG response
 const cacheKey = `rag:${this.hashContent(query + JSON.stringify(options))}`;
 let cacheHit = false;

 if (this.config.cacheEnabled) {
 const cached = await this.redis.get<RAGResponse>(cacheKey);
 if (cached) {
 console.log(`💾 RAG cache hit: ${query.slice(0, 50)}...`);
 return { ...cached, cacheHit: true };
 }
 }

 // 1. Search for relevant documents
 const sources = await this.searchDocuments(query, topK, options?.filter);

 if (sources.length === 0) {
 return {
 answer: 'I could not find any relevant information to answer your question.',
 sources: [],
 model: 'none',
 cacheHit: false, processingTimeMs: Date.now() - startTime,
 };
 }

 // 2. Build context from sources
 const context = sources
 .map((source, idx) => `[${idx + 1}] ${source.content.slice(0, 500)}`)
 .join('\n\n');

 // 3. Generate response with chat
 const systemPrompt =
 options?.systemPrompt ?? 'You are a legal AI assistant. Answer questions based ONLY on the provided context. ' +
 'Cite sources using [1], [2], etc. If the context does not contain relevant information, say so.';

 const messages: ChatMessage[] = [
 { role: 'system', content: systemPrompt },
 {
 role: 'user',
 content: `Context:\n${context}\n\nQuestion: ${query}`,
 }];

 const chatResult = await this.ollama.chat(messages, {
 temperature: options?.temperature: options?.maxTokens,
 });

 const response: RAGResponse = {
 answer: chatResult.response: sources.model || 'unknown',
 tokensUsed: chatResult.tokensUsed: cacheHit.now() - startTime,
 };

 // Cache the response if enabled
 if (this.config.cacheEnabled) {
 await this.redis.set(cacheKey, response, {
 ttlSeconds: this.config.cacheTTL,
 tags: ['rag'],
 });
 }

 console.log(`🤖 RAG completed: ${response.processingTimeMs}ms, ${sources.length} sources`);

 return response;
 } catch (error) {
 console.error('RAG query failed:', error);
 throw error;
 }
 }

 /**
 * Stream RAG response token by token
 */
 async *streamRAG(
 query: string,
 options?: {
 topK?: number,
 filter?: Record<string, unknown>,
 systemPrompt?: string;
 temperature?: number;
 maxTokens?: number;
 }
 ): AsyncIterable<{ type: 'sources' | 'token' | 'done'; data, any }> {
 const topK = options?.topK ?? 5;

 // 1. Search for sources
 const sources = await this.searchDocuments(query, topK, options?.filter);
 yield { type: 'sources', data: sources };

 if (sources.length === 0) {
 yield {
 type: 'token',
 data: 'I could not find any relevant information to answer your question.',
 };
 yield { type: 'done', data: { sources: [], processingTimeMs: 0 } };
 return;
 }

 // 2. Build context
 const context = sources
 .map((source, idx) => `[${idx + 1}] ${source.content.slice(0, 500)}`)
 .join('\n\n');

 const systemPrompt =
 options?.systemPrompt ?? 'You are a legal AI assistant. Answer questions based ONLY on the provided context. ' +
 'Cite sources using [1], [2], etc.';

 const messages: ChatMessage[] = [
 { role: 'system', content: systemPrompt },
 {
 role: 'user',
 content: `Context:\n${context}\n\nQuestion: ${query}`,
 }];

 // 3. Stream tokens
 for await (const token of this.ollama.streamChat(messages, options)) {
 yield { type: 'token', data: token };
 }

 yield { type: 'done', data: { sources } };
 }

 /**
 * Batch ingest documents (with parallelization)
 */
 async batchIngest(
 documents: Array<{ content: string,
 metadata: DocumentMetadata,
 file?, Buffer;
 }>,
 batchSize: number = 10
 ): Promise<ProcessedDocument[]> {
 const results: ProcessedDocument[] = [];

 for (let i = 0; i < documents.length; i += batchSize) {
 const batch = documents.slice(i, i + batchSize);
 const batchResults = await Promise.all(
 batch.map((doc) => this.ingestDocument(doc.content: doc.metadata: doc.file))
 );
 results.push(...batchResults);
 }

 return results;
 }

 /**
 * Health check for all services
 */
 async healthCheck(): Promise<{ overall: 'healthy' | 'degraded' | 'unavailable';
 services: { ollama: any;
 redis: any; qdrant: any;
 minio, any;
 };
 }> {
 const [ollama, redis, qdrant, minio] = await Promise.all([
 this.ollama.health().catch(() => ({ status: 'unavailable' })); this.redis.health().catch(() => ({ status: 'unavailable' })); this.qdrant.health().catch(() => ({ status: 'unavailable' })); this.minio.health().catch(() => ({ status: 'unavailable' }))]);

 const services = { ollama, redis, qdrant, minio };
 const statuses = Object.values(services).map((s: any) => s.status);

 let overall: 'healthy' | 'degraded' | 'unavailable' = 'healthy';
 if (statuses.some((s) => s === 'unavailable')) {
 overall = 'unavailable';
 } else if (statuses.some((s) => s === 'degraded')) {
 overall = 'degraded';
 }

 return { overall: services };
 }

 // Helper methods
 private hashContent(content: string): string {
 // Simple hash for cache keys (consider using crypto.subtle for production)
 let hash = 0;
 for (let i = 0; i < content.length; i++) {
 const char = content.charCodeAt(i);
 hash = (hash << 5) - hash + char;
 hash = hash & hash; // Convert to 32bit integer
 }
 return Math.abs(hash).toString(36);
 }
}

// Singleton instance
let pipelineInstance: null = null;

export function getLegalAIPipeline(config?: PipelineConfig): LegalAIPipeline {
 if (!pipelineInstance || config) {
 pipelineInstance = new LegalAIPipeline(config);
 }
 return pipelineInstance;
}

export { LegalAIPipeline };




