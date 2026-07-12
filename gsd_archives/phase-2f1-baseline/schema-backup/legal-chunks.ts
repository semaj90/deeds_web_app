import { pgTable, uuid, integer, text, timestamp, vector, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { legalNodes } from './legal-nodes';

/**
 * Legal chunks — one or more chunks per legal node.
 * This is the retrieval/index layer, NOT the source of truth.
 * Chunks belong to nodes. Never make chunks the only representation of the law.
 */
export const legalChunks = pgTable('legal_chunks', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	legalNodeId: uuid('legal_node_id').notNull().references(() => legalNodes.id, { onDelete: 'cascade' }),
	chunkIndex: integer('chunk_index').notNull(),
	chunkText: text('chunk_text').notNull(),
	tokenCount: integer('token_count'),
	pageStart: integer('page_start'),
	pageEnd: integer('page_end'),
	charStart: integer('char_start'),
	charEnd: integer('char_end'),
	embedding: vector('embedding', { dimensions: 768 }),  // embeddinggemma:latest
	summary: text('summary'),
	qdrantPointId: text('qdrant_point_id'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	nodeIdx: index('legal_chunks_node_idx').on(table.legalNodeId),
	nodeChunkUnique: unique('legal_chunks_node_chunk_uniq').on(table.legalNodeId, table.chunkIndex),
	embeddingHnsw: index('legal_chunks_embed_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// Type inference
export type LegalChunk = typeof legalChunks.$inferSelect;
export type NewLegalChunk = typeof legalChunks.$inferInsert;
