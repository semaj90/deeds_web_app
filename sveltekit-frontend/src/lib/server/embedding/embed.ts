/**
 * Embedding Facade — unified import point for all embedding operations.
 *
 * Re-exports from canonical modules:
 *   - Batch embeddings: grpc/embedding-client.ts (4-tier fallback)
 *   - Single text embed: ollama.ts (embedText)
 *   - Vector math: embedding/knn-helper.ts (cosine, dot, topK)
 *   - Cache: embedding-cache-service.ts
 */

// ── Batch embeddings (gRPC → QUIC → HTTP) ──────────────────────────────────
export {
	generateEmbeddings,
	generateSingleEmbedding,
	checkGrpcHealth,
	type EmbeddingResult,
	type ProtoEmbeddingRequest,
	type ProtoEmbeddingResponse,
} from '$lib/server/grpc/embedding-client.js';

// ── Vector math utilities ───────────────────────────────────────────────────
export {
	cosineSimilarity,
	dot,
	norm,
	euclideanDistance,
	topKNearest,
	type Vector,
} from '$lib/server/embedding/knn-helper.js';

// ── Cache layer ─────────────────────────────────────────────────────────────
export { embeddingCacheService } from '$lib/server/embedding-cache-service.js';
