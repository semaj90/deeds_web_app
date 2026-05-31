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
// From sveltekit-frontend/src/lib/server/audit/evidence-audit.ts
export * from '../../audit/evidence-audit.js';

// From sveltekit-frontend/src/lib/server/db/seed.ts
export * from '../../db/seed.js';

// From sveltekit-frontend/src/lib/server/evidence/batch-entity-storer.ts
export * from '../../evidence/batch-entity-storer.js';

// From sveltekit-frontend/src/lib/server/evidence/services/drizzle-stub.ts
export * from '../../evidence/services/drizzle-stub.js';

// From sveltekit-frontend/src/lib/server/evidence/video/video-ingest-service.ts
export * from '../../evidence/video/video-ingest-service.js';
