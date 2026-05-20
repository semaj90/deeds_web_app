/**
 * Deprecated compatibility barrel.
 * LEGACY_RAG_LAYER: archived RAG-era schema lives under deeds_labs/snapshots/2026-03-10/bucket-c-stale/.
 * Prefer `src/lib/server/db/schema-postgres.js` for all new imports.
 */
export * from '$lib/server/db/schema-postgres.js';
