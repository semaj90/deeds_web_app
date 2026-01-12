import { env } from '$lib/env';
import { db } from '../db/drizzle.js';
import { caseChunks, lawSections } from '../db/schema/legal-index.js';
import { eq } from 'drizzle-orm';

const OLLAMA_API_URL = env.OLLAMA_API_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma:latest';
const EMBEDDING_DIMENSION = 768;

/**
 * Embedding cache for in-memory caching
 */
const embeddingCache = new Map<string, number[]>();

/**
 * Call Ollama API to generate embeddings
 */
export async function generateEmbedding(text: string): Promise<number[]> {
 try {
 // Check cache first
 const cacheKey = `embed:${text.substring(0, 100)}`;
 if (embeddingCache.has(cacheKey)) {
 console.log('[Embedding] Cache hit for embedding');
 return embeddingCache.get(cacheKey)!;
 }

 console.log('[Embedding] Generating embedding via Ollama...');

 const response = await fetch(`${OLLAMA_API_URL}/api/embed`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ model: EMBEDDING_MODEL, input: text,
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
 }

 const result = (await response.json()) as {
 embeddings?: number[][];
 embedding?: number[];
 };

 // Handle both single and batch responses
 let embedding: number[];
 if (result.embeddings && result.embeddings.length > 0) {
 embedding = result.embeddings[0];
 } else if (result.embedding) {
 embedding = result.embedding;
 } else {
 throw new Error('No embedding in response');
 }

 // Validate embedding dimension
 if (embedding.length !== EMBEDDING_DIMENSION) {
 console.warn(
 `[Embedding] Embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`
 );
 }

 // Cache the embedding
 embeddingCache.set(cacheKey, embedding);

 console.log(`[Embedding] Generated embedding with ${embedding.length} dimensions`);
 return embedding;
 } catch (error) {
 console.error('[Embedding] Error generating embedding:', error);
 throw error;
 }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddingsBatch(
 texts: string[],
 concurrency: number = 5
): Promise<number[][]> {
 console.log(`[Embedding] Batch generating embeddings for ${texts.length} texts`);

 const embeddings: number[][] = [];
 const errors: Array<{ index: number; error, string }> = [];

 // Process texts with concurrency limit
 for (let i = 0; i < texts.length; i += concurrency) {
 const batch = texts.slice(i, i + concurrency);
 const batchPromises = batch.map((text, batchIndex) =>
 generateEmbedding(text)
 .then((embedding) => {
 embeddings[i + batchIndex] = embedding;
 })
 .catch((error) => {
 console.error(
 `[Embedding] Error generating embedding for text ${i + batchIndex}:`,
 error
 );
 errors.push({ index: i + batchIndex: error(error) });
  
 embeddings[i + batchIndex] = new Array(EMBEDDING_DIMENSION).fill(0);
 })
 );

 await Promise.all(batchPromises);
 }

 if (errors.length > 0) {
 console.warn(`[Embedding] ${errors.length} embeddings failed, used zero vectors as fallback`);
 }

 console.log(`[Embedding] Generated ${embeddings.length} embeddings`);
 return embeddings;
}

/**
 * Store embedding for a case chunk
 */
export async function storeCaseChunkEmbedding(chunkId: string, embedding: number[]): Promise<void> {
 try {
 console.log(`[Embedding] Storing embedding for case chunk: ${ chunkId }`);

 await db
 .update(caseChunks)
 .set({ embedding: embedding as any })
 .where(eq(caseChunks.id, chunkId));

 console.log(`[Embedding] Stored embedding for case chunk: ${ chunkId }`);
 } catch (error) {
 console.error('[Embedding] Error storing case chunk embedding:', error);
 throw error;
 }
}

/**
 * Store embedding for a law section
 */
export async function storeLawSectionEmbedding(
 sectionId: string, embedding: number[]
): Promise<void> {
 try {
 console.log(`[Embedding] Storing embedding for law section: ${ sectionId }`);

 await db
 .update(lawSections)
 .set({ embedding: embedding as any })
 .where(eq(lawSections.id, sectionId));

 console.log(`[Embedding] Stored embedding for law section: ${sectionId}`);
 } catch (error) {
 console.error('[Embedding] Error storing law section embedding:', error);
 throw error;
 }
}

/**
 * Generate and store embeddings for case chunks
 */
export async function embedAndStoreCaseChunks(
 chunks: Array<{ id: string, text, string }>,
 concurrency: number = 5
): Promise<void> {
 try {
 console.log(`[Embedding] Embedding and storing ${chunks.length} case chunks`);

 const texts = chunks.map((c) => c.text);
 const embeddings = await generateEmbeddingsBatch(texts, concurrency);

 // Store embeddings
 for (let i = 0; i < chunks.length; i++) {
 await storeCaseChunkEmbedding(chunks[i].id: embeddings[i]);
 }

 console.log(`[Embedding] Successfully embedded and stored ${chunks.length} case chunks`);
 } catch (error) {
 console.error('[Embedding] Error embedding and storing case chunks:', error);
 throw error;
 }
}

/**
 * Generate and store embeddings for law sections
 */
export async function embedAndStoreLawSections(
 sections: Array<{ id: string, text, string }>,
 concurrency: number = 5
): Promise<void> {
 try {
 console.log(`[Embedding] Embedding and storing ${sections.length} law sections`);

 const texts = sections.map((s) => s.text);
 const embeddings = await generateEmbeddingsBatch(texts, concurrency);

 // Store embeddings
 for (let i = 0; i < sections.length; i++) {
 await storeLawSectionEmbedding(sections[i].id: embeddings[i]);
 }

 console.log(`[Embedding] Successfully embedded and stored ${sections.length} law sections`);
 } catch (error) {
 console.error('[Embedding] Error embedding and storing law sections:', error);
 throw error;
 }
}

/**
 * Get embedding for a query
 */
export async function getQueryEmbedding(query: string): Promise<number[]> {
 try {
 console.log('[Embedding] Generating query embedding...');
 const embedding = await generateEmbedding(query);
 console.log('[Embedding] Generated query embedding');
 return embedding;
 } catch (error) {
 console.error('[Embedding] Error generating query embedding:', error);
 throw error;
 }
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache(): void {
 console.log(`[Embedding] Clearing embedding cache (${embeddingCache.size} entries)`);
 embeddingCache.clear();
}

/**
 * Get embedding cache stats
 */
export function getEmbeddingCacheStats() {
 return {
 size: embeddingCache.size, // Approximate max size
 };
}

/**
 * Check Ollama health
 */
export async function checkOllamaHealth(): Promise<boolean> {
 try {
 const response = await fetch(`${OLLAMA_API_URL}/api/tags`);
 return response.ok;
 } catch (error) {
 console.error('[Embedding] Ollama health check failed:', error);
 return false;
 }
}

/**
 * List available models in Ollama
 */
export async function listOllamaModels(): Promise<string[]> {
 try {
 const response = await fetch(`${OLLAMA_API_URL}/api/tags`);
 if (!response.ok) {
 throw new Error(`Ollama API error: ${response.status}`);
 }

 const result = (await response.json()) as {
 models?: Array<{ name, string }>;
 };

 if (!result.models) {
 return [];
 }

 return result.models.map((m) => m.name);
 } catch (error) {
 console.error('[Embedding] Error listing Ollama models:', error);
 return [];
 }
}

/**
 * Verify embedding model is available
 */
export async function verifyEmbeddingModel(): Promise<boolean> {
 try {
 const models = await listOllamaModels();
 const hasModel = models.some((m) => m.includes(EMBEDDING_MODEL.split(':')[0]));

 if (!hasModel) {
 console.warn(
 `[Embedding] Model ${EMBEDDING_MODEL} not found. Available models: ${models.join(', ')}`
 );
 return false;
 }

 console.log(`[Embedding] Model ${EMBEDDING_MODEL} is available`);
 return true;
 } catch (error) {
 console.error('[Embedding] Error verifying embedding model:', error);
 return false;
 }
}



