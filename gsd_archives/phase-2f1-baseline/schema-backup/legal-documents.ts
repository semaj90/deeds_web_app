/**
 * !!! MERGED-WITH-CANONICAL — 2026-05-30 !!!
 *
 * This sidecar was auto-extracted from `drizzle-kit introspect` to mirror the
 * LIVE DB shape. The CANONICAL declaration of this table lives in:
 *   sveltekit-frontend/src/lib/server/db/schema-postgres.ts:564
 *
 * Importers should use the schema-postgres.ts export to avoid duplicate
 * pgTable declarations. This file is retained as a live-DB reference snapshot
 * — diff it against the canonical source to spot drift.
 *
 * If you intentionally want this sidecar to BECOME the canonical source,
 * remove the canonical block from schema-postgres.ts and add an export here
 * to db/schema/index.ts. Don't keep both as canonical.
 */
/**
 * legalDocuments — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `legal_documents`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid, varchar, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const legalDocuments = pgTable("legal_documents", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	content: text(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	s3Bucket: text("s3_bucket").default('legal-documents').notNull(),
	userId: integer("user_id"),
	evidenceId: uuid("evidence_id"),
	createdBy: integer("created_by"),
	status: text().default('queued').notNull(),
	contentEmbedding: vector("content_embedding", { dimensions: 768 }),
	qdrantId: uuid("qdrant_id"),
	qdrantCollection: varchar("qdrant_collection", { length: 100 }),
	lastSyncedToQdrant: timestamp("last_synced_to_qdrant", { withTimezone: true, mode: 'string' }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	// Note: `content_tsv` (tsvector, generated column) exists in the live DB but is
	// not exposed via Drizzle here — Drizzle has no native tsvector type. Apps that
	// need full-text search should use raw SQL against `content_tsv` directly.
	jurisdiction: varchar({ length: 100 }),
}, (table) => [
	index("idx_legal_documents_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	// Note: `legal_documents_content_tsv_gin` GIN index on content_tsv exists in the
	// live DB but cannot be declared here because the column is omitted (see above).
	index("legal_documents_hnsw_idx").using("hnsw", table.contentEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("legal_documents_jurisdiction_idx").using("btree", table.jurisdiction.asc().nullsLast().op("text_ops")).where(sql`(jurisdiction IS NOT NULL)`),
]);

export type LegalDocuments = typeof legalDocuments.$inferSelect;
export type NewLegalDocuments = typeof legalDocuments.$inferInsert;
