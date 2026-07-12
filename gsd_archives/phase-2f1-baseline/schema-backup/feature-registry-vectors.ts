/**
 * featureRegistryVectors — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `feature_registry_vectors`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { index, jsonb, pgTable, text, timestamp, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const featureRegistryVectors = pgTable("feature_registry_vectors", {
	featureKey: text("feature_key").primaryKey().notNull(),
	ownerFile: text("owner_file").notNull(),
	featureTitle: text("feature_title").notNull(),
	storageLane: text("storage_lane").notNull(),
	retrievalLane: text("retrieval_lane").notNull(),
	status: text().default('implemented').notNull(),
	sourceRefs: jsonb("source_refs").default([]).notNull(),
	qdrantTags: jsonb("qdrant_tags").default([]).notNull(),
	turbovecLabel: text("turbovec_label"),
	nextAction: text("next_action"),
	registryText: text("registry_text").notNull(),
	embedding: vector({ dimensions: 768 }),
	embeddingModel: text("embedding_model").default('embeddinggemma:latest').notNull(),
	embeddingStatus: text("embedding_status").default('pending').notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("feature_registry_vectors_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).where(sql`(embedding IS NOT NULL)`).with({m: "16",ef_construction: "64"}),
	index("feature_registry_vectors_owner_file_idx").using("btree", table.ownerFile.asc().nullsLast().op("text_ops")),
	index("feature_registry_vectors_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export type FeatureRegistryVectors = typeof featureRegistryVectors.$inferSelect;
export type NewFeatureRegistryVectors = typeof featureRegistryVectors.$inferInsert;
