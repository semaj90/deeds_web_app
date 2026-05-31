/**
 * embeddings — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `embeddings`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { index, jsonb, pgTable, serial, text, timestamp, varchar, unique, vector } from 'drizzle-orm/pg-core' ;

export const embeddings = pgTable("embeddings", {
	id: serial().primaryKey().notNull(),
	taskId: varchar("task_id", { length: 100 }),
	payload: text(),
	metadata: jsonb(),
	embedding: vector({ dimensions: 384 }),
	textHash: varchar("text_hash", { length: 64 }),
	content: text(),
	model: varchar({ length: 100 }).default('nomic-embed-text:latest'),
	documentType: varchar("document_type", { length: 50 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("idx_embeddings_embedding_ivfflat").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	unique("embeddings_text_hash_unique").on(table.textHash),
]);

export type Embeddings = typeof embeddings.$inferSelect;
export type NewEmbeddings = typeof embeddings.$inferInsert;
