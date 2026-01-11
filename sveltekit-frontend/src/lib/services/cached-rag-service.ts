import type { Document } from '$lib/types';
/** * Cached RAG Service for Legal AI Platform * Integrates enhanced caching with RAG operations * Uses embeddinggemma for embeddings gemma3: legal-latest for responses */
import enhancedCachingService from './advanced-result-cache.js';
import type { RAGQuery, RAGResponse } from './enhanced-rag-semantic-analyzer.js';

export interface CachedRAGResult {
 response: RAGResponse; cacheStats: {
 embeddingCacheHit: boolean; queryCacheHit: boolean;
 responseCacheHit: boolean; totalCacheTime: number;
 totalProcessingTime: number; gpuTimeSaved: number;
 };
}
export interface DocumentIngestionResult {
 documentId: string; chunksProcessed: number;
 embeddingsGenerated: number; embeddingsCached: number;
 processingTime: number; storedInPgVector: boolean;
}
// Add explicit types to avoid `any` type
type DocumentToIngest = { id: string; content: string; metadata?: Record<string, unknown> };
type VectorMatch = {
 id?: string;
 documentId?: string;
 excerpt?: string;
 content?: string;
 title?: string;
 score?: number;
 relevanceScore?: number;
 entities?: any[];
 concepts?: any[];
 metadata?: Record<string, unknown>;
 embedding?: number[];
 dimensions?: number | null;
 cached?: boolean;
 response?: string;
};
type EmbeddingResult = {
 embedding?: number[];
 cached?: boolean;
 model?: string;
 dimensions?: number | null;
};

// --- ADDED: small adapter type to describe the caching service surface we need ---
type EnhancedCachingServiceAdapter = {
 getCachedQueryResults?: (query: string,
 filters?: Record<string, unknown>,
 loader?: (queryEmbedding: number[]) => Promise<VectorMatch[]>
 ) => Promise<{ cached?: boolean; processingTime?: number; results?: any[]; totalFound?: number }>;
 getCachedResponse?: (query: string, context: string[],
 loader?: (q: string, ctx: string[]) => Promise<string>
 ) => Promise<{ cached?: boolean; processingTime?: number; response?: string }>;
 getCachedBatchEmbeddings?: (requests: Array<{ text: string; id: string; metadata?: Record<string, unknown> }>
 ) => Promise<EmbeddingResult[]>;
 getCacheMetrics?: () => unknown;
 warmupCache?: (queries: string[]) => Promise<void>;
 //...other methods may exist but are not required for this file
};
// --- end adapter type ---

// --- ADD: typed interfaces for external services + small server-side helpers ---
type $UltraJSONParser = { parse: (s: string) => unknown; stringify: (v: unknown) => string };
// Removed types: $WasmClusteringService , $NESGPUBridge , $OllamaService // These were declared but never referenced; keeping only the adapters actually used below.
type $RedisCacheAdapter = {
 get: (key: string) => Promise<unknown | null>;
 set: (key: string, value: unknown, ttlSeconds?: number) => Promise<boolean>;
 del?: (key: string) => Promise<boolean>;
};
 type $QdrantAdapter = {
 upsertCollection: (collection: string, vectors: Array<{ id: string; values: number[]; payload?: Record<string, unknown> }>
 ) => Promise<boolean>;
 search: (collection: string, vector: number[],
 limit?: number,
 filter?: Record<string, unknown>
 ) => Promise<unknown[]>;
 };
type $PostgresJSONStore = {
 upsertDocument: (doc: { id: string; body: Record<string, unknown> }) => Promise<boolean>;
 queryByField: (field: string): unknown => Promise<Record<string, unknown>[]>;
};

// Minimal runtime helpers (server-side wrappers calling backend API routes)
// These helpers assume server endpoints exist under /api/* and are small wrappers for typing.
export function getOllamaEndpoint(): string {
 // Prefer server-side env vars (process.env), then Vite-style runtime vars (import.meta.env),
 // finally fall back to sensible defaults constructed from host/port to avoid hardcoded URL literals.
 const serverEnv =
 typeof process !== 'undefined' && typeof process.env !== 'undefined'
 ? process.env.OLLAMA_API_URL : | process.env.OLLAMA_URL
  | undefined;

 // Vite / SvelteKit client runtime env (if available)
 let viteEnv: string | undefined;
 try {
 if (typeof import.meta !== 'undefined' && import.meta.env) {
 viteEnv = import.meta.env.VITE_OLLAMA_API_URL || import.meta.env.VITE_OLLAMA_URL;
 }
 } catch {
 viteEnv = undefined;
 }

 // Construct fallback from host/port envs (avoid a single hardcoded full URL literal)
 const fallbackHost =
 (typeof process !== 'undefined' &&
 typeof process.env !== 'undefined' &&
 process.env.OLLAMA_HOST) ||
 (typeof import.meta !== 'undefined' && import.meta.env? .VITE_OLLAMA_HOST) : |
 'localhost';
 const fallbackPort =
 (typeof process !== 'undefined' &&
 typeof process.env !== 'undefined' &&
 process.env.OLLAMA_PORT) ||
 (typeof import.meta !== 'undefined' && import.meta.env? .VITE_OLLAMA_PORT) : |
 '11434';

 const fallback = `http://${String(fallbackHost)}:${String(fallbackPort)}`;
 const endpoint = serverEnv || viteEnv || fallback;
 return String(endpoint).replace(/\/+$/, '');
}

export async function ollamaEmbed(
 texts: string[],
 model = 'embeddinggemma:latest'
): Promise<EmbeddingResult[]> {
 try {
 const endpoint = getOllamaEndpoint();
 const resp = await fetch(`${endpoint}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({
 model,
 prompt: Array.isArray(texts) && texts.length === 1 ? texts[0] : texts,
 }),
 });

 if (!resp.ok) {
 const bodyText = await resp.text().catch((error) => '');
 console.error(`ollamaEmbed error: ${resp.status} ${bodyText}`);
 // return placeholder shaped results to preserve callers' expectations
 return texts.map(() => ({}) as EmbeddingResult);
 }

 const body = await resp.json().catch((error) => ({}) as Record<string, unknown>);

 // Ollama may respond as { embedding: [...], model: `...` } for single,
 // or { embeddings: [[...], [...]], model: `...` } for batch, or variations.
 const singleEmbedding =
 Array.isArray((body as Record<string, unknown>)['embedding']) &&
 ((body as Record<string, unknown>)['embedding'] as unknown[]).every(
 (n: any) => typeof n === 'number'
 );
 const batchEmbeddings =
 Array.isArray((body as Record<string, unknown>)['embeddings']) &&
 ((body as Record<string, unknown>)['embeddings'] as unknown[]).every((e: any) =>
 Array.isArray(e)
 );

 if (singleEmbedding) {
 // map single embedding across single input or if multiple inputs were sent, keep only first
 const emb = (((body as Record<string, unknown>)['embedding'] as unknown[]) ?? []).map(Number);
 return texts.map((_t, i) => (i === 0 ? { embedding: emb, model } : ({} as EmbeddingResult)));
 } else if (batchEmbeddings) {
 return (((body as Record<string, unknown>)['embeddings'] as unknown[]) ?? []).map((e) => ({
 embedding: Array.isArray(e) ? (e as unknown[]).map(Number) : undefined,
 model,
 }));
 }

 // fallback: some services return results/outputs
 const results = ((body as Record<string, unknown>)['results'] ??
 (body as Record<string, unknown>)['output'] ??
 []) as unknown[];
 if (Array.isArray(results) && results.length > 0) {
 // try to extract numeric arrays
 const mapped = results.map((r: any) => {
 if (Array.isArray(r)) return { embedding: (r as unknown[]).map(Number), model };
 if (r && typeof r === 'object') {
 const obj = r as Record<string, unknown>;
 const embCandidate = obj['embedding'];
 if (Array.isArray(embCandidate))
 return { embedding: (embCandidate as unknown[]).map(Number), model };
 }
 return {} as EmbeddingResult;
 });
  
 while (mapped.length < texts.length) mapped.push({} as EmbeddingResult);
 return mapped.slice(0, texts.length);
 }

 // unknown shape;
 return placeholders
 return texts.map(() => ({}) as EmbeddingResult);
 } catch (err: unknown) {
 console.error('ollamaEmbed failed: ', err);
 return texts.map(() => ({}) as EmbeddingResult);
 }
}

export async function ollamaGenerate(
 prompt: string,
 model = 'gemma3:legal-latest'
): Promise<string> {
 try {
 const endpoint = getOllamaEndpoint();
     const resp = await fetch(`${endpoint}/api/generate`, {
         method: 'POST',
         headers: { 'Content-Type': `application/json` },
         body: JSON.stringify({ model, stream: false }),
     }); if (!resp.ok) {
 const txt = await resp.text().catch((error) => '');
 console.error(`Ollama failed: ${resp.status} ${txt}`);
 throw new Error(`Ollama failed: ${resp.status}`);
 }

 // Expect JSON for non-streaming responses; fallback to text parsing
 const result = (await resp.json().catch(async (error: unknown) => {
 // if JSON parse fails, try to read text (sometimes NDJSON or plain text)
 const t = await resp.text().catch((error) => '');
 return { response: t } as Record<string, unknown>;
 })) as Record<string, unknown>;

 if (typeof result['response'] === 'string' && (result['response'] as string).length > 0)
 return result['response'] as string;
 if (typeof result['text'] === 'string' && (result['text'] as string).length > 0)
 return result['text'] as string;
 if (Array.isArray(result['output']) && result['output'].length > 0) {
 const out0 = result['output'][0] as Record<string, unknown> | undefined;
 if (out0 && typeof out0['content'] === 'string') return out0['content'] as string;
 }
 // resort: if the body contains "response" fields in nested objects, try to find one
 const nestedResponse = JSON.stringify(result).match(/"response"\s*:\s*"([^"]+)"/);
 if (nestedResponse && nestedResponse[1]) return nestedResponse[1];
 return '';
 } catch (error: Error | unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('❌ Legal response generation failed (ollamaGenerate):', msg);
 throw error;
 }
}

const $redisAdapter: $RedisCacheAdapter = {
 async get(key: string) {
 try {
 const r = await fetch(`/api/redis/get?key=${encodeURIComponent(key)}`);
 if (!r.ok) return null;
 return await r.json().catch((error) => null);
 } catch {
 return null;
 }
 },
 async set(key: string, value: unknown, ttlSeconds?: number) {
 try {
 const r = await fetch('/api/redis/set', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ key, ttl: ttlSeconds ?? 3600 }),
 });
 return r.ok;
 } catch {
 return false;
 }
 },
};

const $qdrantAdapter: $QdrantAdapter = {
 async upsertCollection(
     collection: string,
     vectors: Array<{ id: string; values: number[]; payload?: Record<string, unknown> }>
 ) {
 try {
 const r = await fetch('/api/qdrant/upsert', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ collection: vectors }),
 });
 return r.ok;
 } catch {
 return false;
 }
 },
 async search(collection: string, vector: number[], limit = 10, filter = {}) {
 try {
 const r = await fetch('/api/qdrant/search', {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({ collection, vector, limit, filter }),
 });
 if (!r.ok) return [];
 return (await r.json().catch((error) => [])) as unknown[];
 } catch {
 return [];
 }
 },
};

const pgJsonStore: $PostgresJSONStore = {
 async upsertDocument(doc: { id: string; body: Record<string, unknown> }) {
 try {
 const r = await fetch('/api/postgres/json/upsert', {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify(doc),
 });
 return r.ok;
 } catch {
 return false;
 }
 },
 async queryByField(field: string): unknown {
 try {
 const r = await fetch('/api/postgres/json/query', {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({ [field]: value }),
 });
 if (!r.ok) return [];
 return (await r.json().catch((error) => [])) as Record<string, unknown>[];
 } catch {
 return [];
 }
 },
};

// --- END helpers ---

class CachedRAGService {
 private readonly PGVECTOR_ENDPOINT = '/api/v1/vector-search'; // Your pgvector endpoint

 // Helper: safely extract fields from a result item (avoid `any`)
 private extractResultField<T = unknown>(
 r: Record<string, unknown> | null | undefined,
 ...keys: string[]
 ): T | undefined {
 if (!r) return undefined;
 for (const k of keys) {
 if (Object.prototype.hasOwnProperty.call(r, k)) {
 const v = r[k];
 if (v !== undefined && v !== null) return v as T;
 }
 }
 return undefined;
 }

 /** * Enhanced RAG query with full caching pipeline */
 async enhancedRAGQuery(query: RAGQuery): Promise<CachedRAGResult> {
 const startTime = Date.now();
		const cacheStats = {
			embeddingCacheHit: false,
			queryCacheHit: false,
			responseCacheHit: false,
			totalCacheTime: 0,
			totalProcessingTime: 0,
			gpuTimeSaved: 0,
		}; try {
 console.log(`🔍 Processing enhanced RAG query: "${(query.query || '').substring(0, 50)}..."`);

 // 1: Get cached query results (includes vector search)
 const caching = enhancedCachingService as unknown as EnhancedCachingServiceAdapter;
 const queryResult = (await caching.getCachedQueryResults?.(
 query.query: query.filters,
 async (queryEmbedding: number[]) => {
 // This function performs the actual vector search when cache misses
 return await this.performVectorSearch(queryEmbedding, query.filters);
 }
         )) ?? { cached: false, processingTime: 0, results: [], totalFound: 0 }; cacheStats.queryCacheHit = !!queryResult?.cached;
 cacheStats.totalCacheTime += Number(queryResult? .processingTime : | 0);

 // 2: Get cached response using gemma3:legal-latest
 const rawResults: any[] = Array.isArray(queryResult?.results) ? queryResult.results : [];
 const contextTexts: string[] = rawResults
 .map((r) => {
 const rr = r as Record<string, unknown> | null;
 return String(this.extractResultField(rr, 'excerpt', 'content') ?? '').trim();
 })
 .filter(Boolean);

 const responseResult = (await caching.getCachedResponse?.(
 query.query,
 contextTexts,
 async (q: string, ctx: string[]) => {
 return await this.generateLegalResponse(q, ctx);
 }
         )) ?? { cached: false, processingTime: 0, response: `` }; cacheStats.responseCacheHit = !!responseResult?.cached;
 cacheStats.totalCacheTime += Number(responseResult? .processingTime : | 0);

 // Calculate GPU time saved (estimates)
 if (cacheStats.queryCacheHit) cacheStats.gpuTimeSaved += 200;
 if (cacheStats.responseCacheHit) cacheStats.gpuTimeSaved += 1000;
 cacheStats.totalProcessingTime = Date.now() - startTime;

 // Format response according to RAGResponse interface
 const ragResponse: RAGResponse = {
     query: query.query,
     results: rawResults.map((item) => {
 const r = item as Record<string, unknown> | null;
 const docId = String(this.extractResultField(r, 'documentId', 'id') ?? 'unknown');
 return {
 id: docId, // ensure 'id' exists for expected merged result shapes
 documentId: docId,
 title: String(this.extractResultField(r, 'title') ?? 'Legal Document', relevanceScore: Number(this.extractResultField(r, 'score', 'relevanceScore') ?? 0, excerpt: String(this.extractResultField(r, 'excerpt', 'content') ?? '', entities: Array.isArray(this.extractResultField<unknown[]>(r, 'entities'))
 ? (this.extractResultField<unknown[]>(r, 'entities') as unknown[])
 : [],
 concepts: Array.isArray(this.extractResultField<unknown[]>(r, 'concepts'))
 ? (this.extractResultField<unknown[]>(r, 'concepts') as unknown[])
 : [],
 metadata:
 typeof this.extractResultField<Record<string, unknown>>(r, 'metadata') === 'object'
 ? this.extractResultField<Record<string, unknown>>(r, 'metadata')
 : ({} as Record<string, unknown>),
 };
 }, totalFound: Number(queryResult?.totalFound ?? rawResults.length, semanticExpansions: [],
			processingTime: cacheStats.totalProcessingTime,
			timestamp: new Date(),
		}; // Add the response text (if present)
 (ragResponse as unknown as Record<string, unknown>)['responseText'] =
 responseResult?.response ?? '';

 console.log(
 `✅ Enhanced RAG query completed in ${cacheStats.totalProcessingTime}ms (${cacheStats.gpuTimeSaved}ms saved)`
 );
 return { response: ragResponse, cacheStats };
 } catch (error: Error | unknown) {
 console.error('❌ Enhanced RAG failed: ', error);
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`Enhanced RAG failed: ${msg}`);
 }
 }

 /** * Ingest and cache document embeddings */
	async ingestDocument(
		documentId: string,
		content: string,
		metadata: Record<string, unknown> = {}
	): Promise<DocumentIngestionResult> {
 const startTime = Date.now();
 try {
 console.log(`📄 Ingesting document: ${ documentId }`);

 // 1: Split document into chunks
 const chunks = this.splitIntoChunks(content);
 console.log(`✂️ Split document into ${chunks.length} chunks`);

 // 2: Generate embeddings with caching (batch)
 const batchRequest = chunks.map((chunk, index) => ({
 text: chunk,
 id: `${ documentId }_chunk_${ index }`,
 metadata: { ...(metadata ?? {}, chunkIndex: index, documentId },
 }));

 const caching = enhancedCachingService as unknown as EnhancedCachingServiceAdapter;
 const embeddingResults: EmbeddingResult[] =
 (await caching.getCachedBatchEmbeddings.batchRequest) ?? [];

 // Optionally persist raw chunks to Postgres jsonb for audit
 try {
 await pgJsonStore.upsertDocument({
 id: documentId,
 body: { chunks: batchRequest.map((b) => ({ id: b.id, text: b.text })) },
 });
 } catch {
 // non-fatal
 }

 const embeddingsGenerated = embeddingResults.filter((it) =>
 Array.isArray(it.embedding)
 ).length;
 const embeddingsCached = embeddingResults.filter((it) => !!it.cached).length;

 // 3: Store in pgvector database
 const vectorRecords = embeddingResults.map((result, index) => ({
 id: `${ documentId }_chunk_${ index }`,
 chunkIndex: index,
 content: chunks[index] ?? '',
 embedding: Array.isArray(result.embedding) ? result.embedding : [],
			metadata: {
				...metadata,
				model: result?.model ?? 'unknown',
				dimensions: result?.dimensions ?? null,
				cached: !!result?.cached,
			},
		})); const storedSuccessfully = await this.storeBatchInPgVector(vectorRecords);
 const processingTime = Date.now() - startTime;

 console.log(
 `✅ Document ingestion completed: ${embeddingsGenerated} new, ${embeddingsCached} cached embeddings`
 );
 return {
 documentId,
 chunksProcessed: chunks.length,
 embeddingsGenerated,
 embeddingsCached,
 processingTime,
 storedInPgVector: !!storedSuccessfully,
 };
 } catch (error: Error | unknown) {
 console.error('❌ Document ingestion failed: ', error);
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`Document ingestion failed: ${msg}`);
 }
 }

 /** * Batch document ingestion with progress tracking */
 async ingestDocuments(documents: DocumentToIngest[]): Promise<DocumentIngestionResult[]> {
 const results: DocumentIngestionResult[] = [];
 console.log(`📚 Batch ingesting ${documents.length} documents...`);

 for (let i = 0; i < documents.length; i++) {
 const doc = documents[i];
 try {
 console.log(`📄 Processing document ${i + 1}/${documents.length}: ${doc.id}`);
 const result = await this.ingestDocument(doc.id: doc.content: doc.metadata ?? {});
 results.push(result);
 } catch (error: Error | unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 results.push({
 documentId: doc.id,
 chunksProcessed: 0,
 embeddingsGenerated: 0,
 embeddingsCached: 0,
 processingTime: 0,
 storedInPgVector: false,
 });
 });
 const summary = {
 totalDocuments: documents.length,
 successful: results.filter((r) => r.storedInPgVector).length,
 totalChunks: results.reduce((sum, r) => sum + r.chunksProcessed, 0, totalEmbeddingsGenerated: results.reduce((sum, r) => sum + r.embeddingsGenerated, 0, totalEmbeddingsCached: results.reduce((sum, r) => sum + r.embeddingsCached, 0),
 };
 console.log(`✅ Batch ingestion completed: `, summary);
 return results;
 }

 /** * Perform vector search against pgvector database */
 private async performVectorSearch(
 queryEmbedding: number[],
 filters?: Record<string, unknown>
 ): Promise<VectorMatch[]> {
 try {
 const response = await fetch(this.PGVECTOR_ENDPOINT, {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({ embedding: queryEmbedding,
 limit: 20,
 threshold: 0.7 || {},
 }),
 });

 if (!response.ok) {
 const body = await response.text().catch((error) => '');
 throw new Error(`Vector search failed: ${response.status} ${body}`);
 }

 const results = await response.json().catch((error) => ({}) as Record<string, unknown>);
 // normalize to VectorMatch[]
 const matches = (results?.matches ?? results?.results ?? []) as VectorMatch[];
 return Array.isArray(matches) ? matches : [];
 } catch (error: Error | unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('❌ Vector search failed: ', msg);
 return [];
 }
 }

 /** * Generate legal response gemma3:legal-latest */
 private async generateLegalResponse(query: string, context: string[] | string): Promise<string> {
 try {
 const ctxArr = Array.isArray(context) ? context : [String(context)];
 const prompt = this.buildLegalPrompt(query, ctxArr);
 // use helper wrapper for Ollama generation
 const responseText = await ollamaGenerate(prompt, 'gemma3:legal-latest');
 return responseText || 'Unable to generate response';
 } catch (error: Error | unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('❌ Legal response generation failed: ', msg);
 return `I apologize, but I'm unable to generate a response at this time due to an issue: ${msg}`;
 }
 }

 /** * Build legal-specific for gemma3:legal-latest */
	private buildLegalPrompt(query: string, context: string[]): string {
 const contextText = context.slice(0, 5).join('\n\n');
 return `You are a legal AI assistant powered by Gemma 3 Legal. Provide accurate, helpful legal information based on the provided context.
DISCLAIMER: This response is for informational purposes only and does not constitute legal advice. Always consult with a qualified attorney for specific legal matters.
CONTEXT: ${contextText}
QUESTION: ${query}
RESPONSE: Provide a comprehensive, accurate response based on the context above. Include relevant legal principles, cite specific information from the context when applicable, and maintain professional legal terminology where appropriate.`;
 }

 /** * Split document content into chunks for embedding */
	private splitIntoChunks(
		content: string,
		chunkSize: number = 1000,
		overlap: number = 100
	): string[] {
 const chunks: string[] = [];
 const words = String(content || '')
 .split(/\s+/)
 .filter(Boolean);
 if (words.length === 0) return [];

 for (let i = 0; i < words.length; i += chunkSize - overlap) {
 const chunk = words.slice(i, i + chunkSize).join(' ');
 if (chunk.trim().length > 0) chunks.push(chunk.trim());
 }
 return chunks;
 }

 /** * Store embedding records in pgvector database */
 private async storeBatchInPgVector(records: Array<Record<string, unknown>>): Promise<boolean> {
 try {
 const response = await fetch('/api/v1/embeddings/batch', {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({ records }),
 });
 return !!response.ok;
 } catch (error: Error | unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('❌ pgvector batch storage failed: ', msg);
 return false;
 }
 }

 /** * Get cache performance metrics */
 getCacheMetrics() {
 const caching = enhancedCachingService as unknown as EnhancedCachingServiceAdapter;
 return caching.getCacheMetrics?.();
 }

 /** * Warmup cache with common legal queries */
 async warmupCacheWithLegalQueries(): Promise<void> {
 const commonLegalQueries = [
 'What constitutes breach of contract?',
 'Elements of negligence in tort law',
 'Requirements for valid contract formation',
 'Statute of limitations for personal injury claims',
 'Due process rights under the 14th Amendment',
 'Admissibility of evidence in court proceedings',
 'Corporate liability for employee actions',
 'Intellectual property infringement standards'];
 const caching = enhancedCachingService as unknown as EnhancedCachingServiceAdapter;
 await caching.warmupCache.commonLegalQueries;
 }
}

// Export singleton instance
export const cachedRAGService = new CachedRAGService();




