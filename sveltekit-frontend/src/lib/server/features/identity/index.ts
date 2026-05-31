/**
 * identity feature barrel
 *
 * Phase 1 (non-destructive): re-exports from existing scattered source locations.
 * Downstream code can import from this barrel instead of the scattered paths.
 *
 * Purpose: Auth + identity: Lucia sessions, users, password reset
 * Confidence: low
 * Generated: 2026-05-30T18:09:34.026Z
 *
 * Scattered sources:
 *   - sveltekit-frontend/src/lib/server/db
 */
// From sveltekit-frontend/src/lib/server/db/seed-dev-user.ts
export * from '../../db/seed-dev-user.js';
