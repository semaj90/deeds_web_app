/**
 * legalCorpus feature barrel
 *
 * Phase 1 (non-destructive): re-exports from existing scattered source locations.
 * Downstream code can import from this barrel instead of the scattered paths.
 *
 * Purpose: Legal corpus: statutes, citations, legal docs, precedents
 * Confidence: medium
 * Generated: 2026-05-30T18:09:34.025Z
 *
 * Scattered sources:
 *   - sveltekit-frontend/src/lib/server/db
 *   - sveltekit-frontend/src/lib/server/legal
 */
// From sveltekit-frontend/src/lib/server/db/seed-citations.ts
export * from '../../db/seed-citations.js';

// From sveltekit-frontend/src/lib/server/legal/constitution-pipeline.ts
export * from '../../legal/constitution-pipeline.js';

// From sveltekit-frontend/src/lib/server/legal/ingestion-worker.ts
export * from '../../legal/ingestion-worker.js';

// From sveltekit-frontend/src/lib/server/legal/law-citations.ts
export * from '../../legal/law-citations.js';
