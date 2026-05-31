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
// From sveltekit-frontend/src/lib/server/ace/multi-lane-retrieval.ts
export * from '../../ace/multi-lane-retrieval.js';

// From sveltekit-frontend/src/lib/server/ace/ngram-retrieval.ts
export * from '../../ace/ngram-retrieval.js';

// From sveltekit-frontend/src/lib/server/ace/retrieval-lanes.ts
export * from '../../ace/retrieval-lanes.js';

// From sveltekit-frontend/src/lib/server/admin/retrieval-analytics-service.ts
export * from '../../admin/retrieval-analytics-service.js';

// From sveltekit-frontend/src/lib/server/retrieval/ace-retrieval-logger.ts
export * from '../../retrieval/ace-retrieval-logger.js';

// From sveltekit-frontend/src/lib/server/retrieval/codebase-context.ts
export * from '../../retrieval/codebase-context.js';

// From sveltekit-frontend/src/lib/server/retrieval/cold-storage-retrieval-service.ts
export * from '../../retrieval/cold-storage-retrieval-service.js';

// From sveltekit-frontend/src/lib/server/retrieval/context-buffer.ts
export * from '../../retrieval/context-buffer.js';

// From sveltekit-frontend/src/lib/server/retrieval/qlora-boost.ts
export * from '../../retrieval/qlora-boost.js';

// From sveltekit-frontend/src/lib/server/retrieval/sparse-bm25.ts
export * from '../../retrieval/sparse-bm25.js';
