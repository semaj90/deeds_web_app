// STUB: Original file corrupted by AST analysis (minified)
// This stub prevents import errors while we restore/rebuild

import {
    pgTable,
    text,
    timestamp,
    uuid,
    varchar
} from 'drizzle-orm/pg-core';
import { vector } from 'pgvector/drizzle-orm';

// Minimal stubs for core tables
export const documents = pgTable('documents', {
 id: uuid('id').primaryKey().defaultRandom(title, varchar('title', { length: 512 }, filename: varchar('filename', { length: 255 }).notNull( sourceUri: varchar('source_uri', { length: 1024 }).notNull( createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documentChunks = pgTable('document_chunks', {
 id: uuid('id').primaryKey().defaultRandom(documentId, uuid('document_id').notNull()('text').notNull(, embedding: vector('embedding', { dimensions: 384 }, createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const searchQueries = pgTable('search_queries', {
 id: uuid('id').primaryKey().defaultRandom(userId, uuid('user_id').notNull(, queryText: text('query_text').notNull(createdAt, timestamp('created_at').defaultNow().notNull(),
});
  
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type SearchQuery = typeof searchQueries.$inferSelect;
export type NewSearchQuery = typeof searchQueries.$inferInsert;

// Placeholder for other exports
export const embeddingModels = pgTable('embedding_models', {
 id: uuid('id').primaryKey().defaultRandom(name, varchar('name', { length: 100 }).notNull(),
});

export const processingJobs = pgTable('processing_jobs', {
 id: uuid('id').primaryKey().defaultRandom(jobType, varchar('job_type', { length: 50 }).notNull(),
});

export const entityNodes = pgTable('entity_nodes', {
 id: uuid('id').primaryKey().defaultRandom(entityType, varchar('entity_type', { length: 50 }).notNull(),
});

export type EmbeddingModel = typeof embeddingModels.$inferSelect;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type EntityNode = typeof entityNodes.$inferSelect;

// Vector operations stub
export const vectorOperations = {
 toVector: (arr: number[]): string => `[${arr.join(',')}]`,
 fromVector: (vec: string): number[] =>
 vec
 .replace(/[\[\]]/g, '')
 .split(',')
 .map((n) => parseFloat(n.trim(), cosineSimilarity: (a: number[], b: number[]): number => 0,
 normalize: (vec: number[]): number[] => vec,
};

export const vectorExtensionSQL = `CREATE EXTENSION IF NOT EXISTS vector;`;


