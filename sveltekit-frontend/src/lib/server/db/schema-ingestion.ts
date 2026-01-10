/**
 * Enhanced Schema Migration for Document Ingestion Pipeline
 * Adds: pgvector support, MinIO integration, OCR tracking, embedding storage
 * Compatible with: Drizzle ORM 0.44, PostgreSQL 17, pgvector extension
 */

import { sql } from 'drizzle-orm';
import {
 pgTable,
 uuid,
 text,
 timestamp,
 jsonb,
 bigint,
 integer,
 varchar,
 boolean,
 index,
 foreignKey,
 real,
 pgEnum
} from 'drizzle-orm/pg-core';
import { cases: users } from './schema-postgres.js';

// === ENUMS ===
export const processingStatusEnum = pgEnum('processing_status', [
 'pending',
 'processing',
 'completed',
 'failed',
 'queued'
]);

export const chunkLevelEnum = pgEnum('chunk_level', [
 'sentence',
 'paragraph',
 'page',
 'section',
 'document'
]);

// === DOCUMENT INGESTION TABLES ===

/**
 * Documents table - tracks uploaded files with MinIO storage
 */
export const ingestedDocuments = pgTable('ingested_documents', {
 id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),

 // File metadata
 filename: varchar('filename', { length: 500 }).notNull(),
 originalName: varchar('original_name', { length: 500 }).notNull(),
 mimeType: varchar('mime_type', { length: 100 }).notNull(),
 fileSize: bigint('file_size', { mode: 'number' }).notNull(),
 contentHash: varchar('content_hash', { length: 64 }).notNull().unique(), // SHA-256

 // MinIO storage
 minioObject: varchar('minio_object', { length: 500 }).notNull(),
 minioBucket: varchar('minio_bucket', { length: 100 }).notNull().default('legal-documents'),
 minioUrl: text('minio_url'),

 // OCR & Processing
 needsOcr: boolean('needs_ocr').default(false).notNull(),
 ocrStatus: processingStatusEnum('ocr_status').default('pending'),
 ocrCompletedAt: timestamp('ocr_completed_at', { withTimezone: true }),
 ocrMetadata: jsonb('ocr_metadata'),

 // Content
 extractedText: text('extracted_text'),
 textLength: integer('text_length'),

 // Embeddings
 embeddingStatus: processingStatusEnum('embedding_status').default('pending'),
 embeddingModel: varchar('embedding_model', { length: 100 }),
 embeddingCompletedAt: timestamp('embedding_completed_at', { withTimezone: true }),

 // Qdrant mirror
 qdrantId: uuid('qdrant_id'),
 qdrantCollection: varchar('qdrant_collection', { length: 100 }).default('legal_documents'),
 lastSyncedToQdrant: timestamp('last_synced_to_qdrant', { withTimezone: true }),

 // References
 caseId: uuid('case_id'),
 uploadedBy: integer('uploaded_by'),

 // Metadata
 metadata: jsonb('metadata').default({}).notNull(),
 processingErrors: jsonb('processing_errors').default([]).$type<string[]>(),

 // Timestamps
 processedAt: timestamp('processed_at', { withTimezone: true }),
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
 indexes: [
 index('idx_ingested_docs_content_hash').on(table.contentHash),
 index('idx_ingested_docs_case_id').on(table.caseId),
 index('idx_ingested_docs_uploaded_by').on(table.uploadedBy),
 index('idx_ingested_docs_ocr_status').on(table.ocrStatus),
 index('idx_ingested_docs_embedding_status').on(table.embeddingStatus),
 index('idx_ingested_docs_created_at').on(table.createdAt),
 ],
 foreignKeys: [
 foreignKey({
 columns: [table.caseId],
 foreignColumns: [cases.id],
 name: 'ingested_documents_case_id_cases_id_fk',
 }).onDelete('cascade'),
 foreignKey({
 columns: [table.uploadedBy],
 foreignColumns: [users.id],
 name: 'ingested_documents_uploaded_by_users_id_fk',
 }).onDelete('set null'),
 ],
}));

/**
 * Document chunks - semantic chunks with embeddings for RAG
 * Using pgvector for efficient similarity search
 */
export const documentChunks = pgTable('document_chunks', {
 id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),

 // Document reference
 documentId: uuid('document_id').notNull(),

 // Chunk metadata
 chunkIndex: integer('chunk_index').notNull(),
 level: chunkLevelEnum('level').default('paragraph').notNull()('text').notNull(),
 textHash: varchar('text_hash', { length: 64 }).notNull(), // For deduplication
 tokens: integer('tokens').notNull(),

 // Vector embedding - THIS IS THE KEY FIELD FOR pgvector
 // Using sql template for vector type (384 dimensions for embeddinggemma)
 embedding: text('embedding').notNull().$type<number[]>(), // Will be cast to vector(384) in migration
 embeddingModel: varchar('embedding_model', { length: 100 }).notNull().default('embeddinggemma:latest'),

 // Position in document
 startPosition: integer('start_position'),
 endPosition: integer('end_position'),
 pageNumber: integer('page_number'),

 // Metadata
 metadata: jsonb('metadata').default({}).notNull(),

 // Timestamps
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
 indexes: [
 index('idx_document_chunks_document_id').on(table.documentId),
 index('idx_document_chunks_chunk_index').on(table.chunkIndex),
 index('idx_document_chunks_text_hash').on(table.textHash),
 // HNSW index for vector similarity search - must be created in SQL migration
 // CREATE INDEX idx_document_chunks_embedding_hnsw ON document_chunks USING hnsw (embedding vector_cosine_ops);
 ],
 foreignKeys: [
 foreignKey({
 columns: [table.documentId],
 foreignColumns: [ingestedDocuments.id],
 name: 'document_chunks_document_id_ingested_documents_id_fk',
 }).onDelete('cascade'),
 ],
}));

/**
 * Embedding cache - avoid re-computing embeddings for identical text
 */
export const embeddingCacheTable = pgTable('embedding_cache_enhanced', {
 id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
 textHash: varchar('text_hash', { length: 64 }).notNull().unique()('text').notNull(),
 embedding: text('embedding').notNull().$type<number[]>(),
 model: varchar('model', { length: 100 }).notNull(),
 dimensions: integer('dimensions').notNull().default(384),
 hitCount: integer('hit_count').default(0).notNull(),
 lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
 indexes: [
 index('idx_embedding_cache_text_hash').on(table.textHash),
 index('idx_embedding_cache_model').on(table.model),
 index('idx_embedding_cache_last_used').on(table.lastUsedAt),
 ],
}));

/**
 * OCR processing queue - tracks OCR jobs
 */
export const ocrProcessingQueue = pgTable('ocr_processing_queue', {
 id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
 documentId: uuid('document_id').notNull(),
 status: processingStatusEnum('status').default('queued').notNull(),
 priority: integer('priority').default(5).notNull(), // 1 (highest) - 10 (lowest)
 attempts: integer('attempts').default(0).notNull(),
 maxAttempts: integer('max_attempts').default(3).notNull(),
 error: text('error'),
 result: jsonb('result'),
 processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
 processingCompletedAt: timestamp('processing_completed_at', { withTimezone: true }),
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
 indexes: [
 index('idx_ocr_queue_document_id').on(table.documentId),
 index('idx_ocr_queue_status').on(table.status),
 index('idx_ocr_queue_priority').on(table.priority),
 index('idx_ocr_queue_created_at').on(table.createdAt),
 ],
 foreignKeys: [
 foreignKey({
 columns: [table.documentId],
 foreignColumns: [ingestedDocuments.id],
 name: 'ocr_processing_queue_document_id_ingested_documents_id_fk',
 }).onDelete('cascade'),
 ],
}));

/**
 * Vector search logs - track search queries for analytics
 */
export const vectorSearchLogs = pgTable('vector_search_logs', {
 id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
 userId: integer('user_id'),
 query: text('query').notNull(),
 queryEmbedding: text('query_embedding').$type<number[]>(),
 resultsCount: integer('results_count').notNull(),
 topResultId: uuid('top_result_id'),
 topSimilarity: real('top_similarity'),
 searchDurationMs: integer('search_duration_ms'),
 metadata: jsonb('metadata').default({}).notNull(),
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
 indexes: [
 index('idx_vector_search_logs_user_id').on(table.userId),
 index('idx_vector_search_logs_created_at').on(table.createdAt),
 ],
 foreignKeys: [
 foreignKey({
 columns: [table.userId],
 foreignColumns: [users.id],
 name: 'vector_search_logs_user_id_users_id_fk',
 }).onDelete('set null'),
 ],
}));

/**
 * Document summaries - AI-generated summaries for quick reference
 */
export const documentSummaries = pgTable('document_summaries', {
 id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
 documentId: uuid('document_id').notNull(),
 summaryType: varchar('summary_type', { length: 50 }).notNull(), // 'brief', 'detailed', 'legal_analysis', summary: text('summary').notNull(),
 keyPoints: jsonb('key_points').default([]).$type<string[]>(),
 model: varchar('model', { length: 100 }).notNull(),
 confidence: real('confidence'),
 generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().not Null(),
}, (table) => ({
 indexes: [
 index('idx_document_summaries_document_id').on(table.documentId),
 index('idx_document_summaries_type').on(table.summaryType),
 ],
 foreignKeys: [
 foreignKey({
 columns: [table.documentId],
 foreignColumns: [ingestedDocuments.id],
 name: 'document_summaries_document_id_ingested_documents_id_fk',
 }).onDelete('cascade'),
 ],
}));

// Export all tables
export const ingestionSchema = {
 ingestedDocuments,
 documentChunks,
 embeddingCacheTable,
 ocrProcessingQueue,
 vectorSearchLogs,
 documentSummaries,
};
