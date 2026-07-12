/**
 * featureCards — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `feature_cards`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const featureCards = pgTable("feature_cards", {
	id: text().primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	area: text(),
	contentHash: text("content_hash"),
	schemaVersion: text("schema_version"),
	cardJson: jsonb("card_json"),
	// Note: `card_msgpack` bytea column exists in the live DB but is omitted here.
	// Drizzle has no native bytea helper; read via raw SQL when needed.
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("feature_cards_source_ref_content_hash_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops"), table.contentHash.asc().nullsLast().op("text_ops")),
]);

export type FeatureCards = typeof featureCards.$inferSelect;
export type NewFeatureCards = typeof featureCards.$inferInsert;
