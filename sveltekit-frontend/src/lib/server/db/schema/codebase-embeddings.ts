/**
 * codebaseEmbeddings — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `codebase_embeddings`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { foreignKey, index, integer, pgTable, real, text, timestamp, unique, uuid, varchar, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { codebaseFiles } from './codebase-files.js';

export const codebaseEmbeddings = pgTable("codebase_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fileId: uuid("file_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	chunkText: text("chunk_text").notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	embeddingModel: varchar("embedding_model", { length: 100 }).default('embeddinggemma:latest'),
	tokens: integer(),
	gpuDevice: varchar("gpu_device", { length: 50 }),
	cudaTimeMs: real("cuda_time_ms"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_codebase_embeddings_file").using("btree", table.fileId.asc().nullsLast().op("uuid_ops")),
	index("idx_codebase_embeddings_hnsw").using("hnsw", sql`((embedding)::halfvec(768))`).with({m: "16",ef_construction: "64"}),
	foreignKey({
			columns: [table.fileId],
			foreignColumns: [codebaseFiles.id],
			name: "codebase_embeddings_file_id_fkey"
		}).onDelete("cascade"),
	unique("codebase_embeddings_file_id_chunk_index_key").on(table.chunkIndex, table.fileId),
]);

export type CodebaseEmbeddings = typeof codebaseEmbeddings.$inferSelect;
export type NewCodebaseEmbeddings = typeof codebaseEmbeddings.$inferInsert;
