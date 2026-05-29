/**
 * Binary embedding cache for Redis
 * Stores Float32Array embeddings in binary format (4x smaller than JSON)
 * Re-routed to the unified embedding-cache-unified.ts format.
 */

export {
	cacheEmbedding,
	getEmbedding as getCachedEmbedding,
	batchCacheEmbeddings,
	batchGetCachedEmbeddings,
	clearEmbeddingCache
} from './cache/embedding-cache-unified.js';
