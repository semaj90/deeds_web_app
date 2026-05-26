/**
 * Deprecated compatibility barrel.
 * This file is preserved only for legacy imports from `$lib/db/schema`.
 * Do not add new Zod schemas or schema generation helpers here.
 * Use `src/lib/server/db/schema-postgres.js` as the canonical source of truth.
 *
 * NOTE: `createInsertSchema` should be generated from the canonical Drizzle schema
 * in the server package, not duplicated in this compatibility layer.
 */
export * from '$lib/server/db/schema-postgres.js';
