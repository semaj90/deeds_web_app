export { getOllamaEndpoint, default as ollamaUtils } from '$lib/server/ollama';

// Note: Re-exporting these might cause circular dependencies if not careful.
// Explicitly exporting classes/types if needed.
export { OllamaEmbeddingService } from './ollama-embeddings.js';
export { QdrantVectorService } from './qdrant-vector.js';
export { default as Neo4jClient } from './neo4j-client.js';
export { knowledgeCache as knowledgeCacheReady } from './knowledge-cache.js';

// Legacy compatibility - try to avoid wildcard exports if possible, but keeping for now
export * from './gpu-pipeline.js';
export * from './ollama-embeddings.js';
export * from './qdrant-vector.js';