/**
 * rag feature barrel
 *
 * Phase 1 (non-destructive): re-exports from existing scattered source locations.
 * Downstream code can import from this barrel instead of the scattered paths.
 *
 * Purpose: RAG pipeline: Qdrant retrieval + reranking + Bifrost cache
 * Confidence: high
 * Generated: 2026-05-30T18:09:34.025Z
 *
 * Scattered sources:
 *   - sveltekit-frontend/src/lib/server/ace
 *   - sveltekit-frontend/src/lib/server/admin
 *   - sveltekit-frontend/src/lib/server/retrieval
 */
// From sveltekit-frontend/src/lib/server/features/rag/multi-lane-retrieval.ts
export * from './multi-lane-retrieval.js';

// From sveltekit-frontend/src/lib/server/features/rag/ngram-retrieval.ts
export * from './ngram-retrieval.js';

// From sveltekit-frontend/src/lib/server/features/rag/retrieval-lanes.ts
export * from './retrieval-lanes.js';

// From sveltekit-frontend/src/lib/server/features/rag/retrieval-analytics-service.ts
export * from './retrieval-analytics-service.js';

// From sveltekit-frontend/src/lib/server/features/rag/ace-retrieval-logger.ts
export * from './ace-retrieval-logger.js';

// From sveltekit-frontend/src/lib/server/features/rag/codebase-context.ts
export * from './codebase-context.js';

// From sveltekit-frontend/src/lib/server/features/rag/cold-storage-retrieval-service.ts
export * from './cold-storage-retrieval-service.js';

// From sveltekit-frontend/src/lib/server/features/rag/context-buffer.ts
export * from './context-buffer.js';
