/**
 * vectorSmoke — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `vector_smoke`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { bigserial, index, pgTable, vector } from 'drizzle-orm/pg-core';

export const vectorSmoke = pgTable("vector_smoke", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	embedding: vector({ dimensions: 3 }),
}, (table) => [
	index("vector_smoke_hnsw_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
]);

export type VectorSmoke = typeof vectorSmoke.$inferSelect;
export type NewVectorSmoke = typeof vectorSmoke.$inferInsert;
