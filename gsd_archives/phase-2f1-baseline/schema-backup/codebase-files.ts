/**
 * codebaseFiles — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `codebase_files`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { index, integer, jsonb, pgTable, real, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

export const codebaseFiles = pgTable("codebase_files", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	filePath: text("file_path").notNull(),
	fileHash: varchar("file_hash", { length: 64 }).notNull(),
	language: varchar({ length: 50 }).notNull(),
	linesOfCode: integer("lines_of_code").notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	domain: varchar({ length: 100 }),
	importanceScore: real("importance_score").default(0),
	communityId: integer("community_id"),
	indexedAt: timestamp("indexed_at", { mode: 'string' }).defaultNow(),
	lastModified: timestamp("last_modified", { mode: 'string' }),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_codebase_files_community").using("btree", table.communityId.asc().nullsLast().op("int4_ops")),
	index("idx_codebase_files_domain").using("btree", table.domain.asc().nullsLast().op("text_ops")),
	index("idx_codebase_files_importance").using("btree", table.importanceScore.desc().nullsFirst().op("float4_ops")),
	index("idx_codebase_files_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	unique("codebase_files_file_path_key").on(table.filePath),
]);

export type CodebaseFiles = typeof codebaseFiles.$inferSelect;
export type NewCodebaseFiles = typeof codebaseFiles.$inferInsert;
