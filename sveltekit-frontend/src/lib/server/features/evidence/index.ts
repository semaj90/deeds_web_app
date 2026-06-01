/**
 * evidence feature barrel
 *
 * Phase 1 (non-destructive): re-exports from existing scattered source locations.
 * Downstream code can import from this barrel instead of the scattered paths.
 *
 * Purpose: Evidence pipeline: ingest → analyze → custody chain → embeddings
 * Confidence: high
 * Generated: 2026-05-30T18:09:34.023Z
 *
 * Scattered sources:
 *   - sveltekit-frontend/src/lib/server/audit
 *   - sveltekit-frontend/src/lib/server/db
 *   - sveltekit-frontend/src/lib/server/evidence
 *   - sveltekit-frontend/src/lib/server/evidence/services
 *   - sveltekit-frontend/src/lib/server/evidence/video
 */
// From sveltekit-frontend/src/lib/server/features/evidence/audit/evidence-audit.ts
export * from './audit/evidence-audit.js';

// From sveltekit-frontend/src/lib/server/features/evidence/db/seed.ts
export * from './db/seed.js';

// From sveltekit-frontend/src/lib/server/features/evidence/batch-entity-storer.ts
export * from './batch-entity-storer.js';

// From sveltekit-frontend/src/lib/server/features/evidence/services/drizzle-stub.ts
export * from './services/drizzle-stub.js';

// From sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts
export * from './video/video-ingest-service.js';
