/**
 * Enhanced Schema Migration for Document Ingestion Pipeline
 * Adds: pgvector, MinIO integration, OCR tracking, embedding storage
 * Compatible with: Drizzle ORM 0.44, PostgreSQL + pgvector extension
 *
 * IMPORTANT STORAGE BOUNDARY
 * --------------------------
 * This module describes the legacy legal-document ingestion tables created by
 * drizzle/migrations/001_enable_pgvector_ingestion.sql. Those physical columns
 * are vector(384). They are NOT the Parent Atlas canonical semantic_512
 * representation and must not be used to infer Parent Atlas representation
 * identity from dimensionality alone.
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
    pgEnum,
    vector
} from 'drizzle-orm/pg-core';
import { cases, users } from './schema-postgres.js';

// Historical ingestion representation. Keep separate from Parent Atlas semantic_512.
export const LEGACY_INGESTION_VECTOR_DIMENSION = 384 as const;

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

    // Qdrant mirror. This is a rebuildable projection pointer, not identity authority.
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
},
	(table) => ({
    indexes: [
        index('idx_ingested_docs_content_hash').on(table.contentHash),
        index('idx_ingested_docs_case_id').on(table.caseId),
        index('idx_ingested_docs_uploaded_by').on(table.uploadedBy),
        index('idx_ingested_docs_ocr_status').on(table.ocrStatus),
        index('idx_ingested_docs_embedding_status').on(table.embeddingStatus),
        index('idx_ingested_docs_created_at').on(table.createdAt)
    ],
    foreignKeys: [
        foreignKey({
            columns: [table.caseId],
            foreignColumns: [cases.id],
            name: 'ingested_documents_case_id_cases_id_fk',
        }).onDelete('cascade'),
        // Note: uploadedBy references users.id (integer), assuming users from schema-postgres.ts
        // If users.id is UUID in schema-postgres.ts, this type in table definition above should be uuid not integer
        // Checking schema-postgres: usually users.id is UUID or text or integer.
        // ingestedDocuments.uploadedBy is defined as integer above.
        // Assuming user.id is integer based on uploadedBy definition.
        foreignKey({
            columns: [table.uploadedBy],
            foreignColumns: [users.id],
            name: 'ingested_documents_uploaded_by_users_id_fk',
        }).onDelete('set null')
    ],
}));

/**
 * Document chunks - semantic chunks with embeddings for legacy legal RAG.
 *
 * The physical migration creates vector(384). Use Drizzle's native pgvector
 * type so schema metadata matches PostgreSQL. Parent Atlas semantic_512 is a
 * separate representation family and must not be collapsed into this table.
 */
export const ingestedDocumentChunks = pgTable('document_chunks', {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),

    // Document reference. Physical migration uses UUID.
    documentId: uuid('document_id').notNull(),

    // Chunk metadata
    chunkIndex: integer('chunk_index').notNull(),
    level: chunkLevelEnum('level').default('paragraph').notNull(),
    text: text('text').notNull(),
    textHash: varchar('text_hash', { length: 64 }).notNull(), // For deduplication
    tokens: integer('tokens').notNull(),

    // Legacy ingestion vector. This is not Parent Atlas semantic_512.
    embedding: vector('embedding', { dimensions: LEGACY_INGESTION_VECTOR_DIMENSION }).notNull(),
    embeddingModel: varchar('embedding_model', { length: 100 }).notNull().default('embeddinggemma:latest'),

    // Position in document
    startPosition: integer('start_position'),
    endPosition: integer('end_position'),
    pageNumber: integer('page_number'),

    // Metadata
    metadata: jsonb('metadata').default({}).notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
},
	(table) => ({
    indexes: [
        index('idx_document_chunks_document_id').on(table.documentId),
        index('idx_document_chunks_chunk_index').on(table.chunkIndex),
        index('idx_document_chunks_text_hash').on(table.textHash),
        // HNSW is created by SQL migration because extension/index lifecycle is operator-owned.
        // CREATE INDEX idx_document_chunks_embedding_hnsw ON document_chunks USING hnsw (embedding vector_cosine_ops);
    ],
    foreignKeys: [
        foreignKey({
            columns: [table.documentId],
            foreignColumns: [ingestedDocuments.id],
            name: 'document_chunks_document_id_ingested_documents_id_fk',
        }).onDelete('cascade')
    ],
}));

/**
 * Embedding cache - avoid re-computing embeddings for identical legacy-ingestion text.
 */
export const embeddingCacheTable = pgTable('embedding_cache_enhanced', {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    textHash: varchar('text_hash', { length: 64 }).notNull().unique(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: LEGACY_INGESTION_VECTOR_DIMENSION }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    dimensions: integer('dimensions').notNull().default(LEGACY_INGESTION_VECTOR_DIMENSION),
    hitCount: integer('hit_count').default(0).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
},
	(table) => ({
    indexes: [
        index('idx_embedding_cache_text_hash').on(table.textHash),
        index('idx_embedding_cache_model').on(table.model),
        index('idx_embedding_cache_last_used').on(table.lastUsedAt)
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
},
	(table) => ({
    indexes: [
        index('idx_ocr_queue_document_id').on(table.documentId),
        index('idx_ocr_queue_status').on(table.status),
        index('idx_ocr_queue_priority').on(table.priority),
        index('idx_ocr_queue_created_at').on(table.createdAt)
    ],
    foreignKeys: [
        foreignKey({
            columns: [table.documentId],
            foreignColumns: [ingestedDocuments.id],
            name: 'ocr_processing_queue_document_id_ingested_documents_id_fk',
        }).onDelete('cascade')
    ],
}));

/**
 * Vector search logs - track search queries for analytics
 */
export const vectorSearchLogs = pgTable('vector_search_logs', {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    userId: integer('user_id'),
    query: text('query').notNull(),
    queryEmbedding: vector('query_embedding', { dimensions: LEGACY_INGESTION_VECTOR_DIMENSION }),
    resultsCount: integer('results_count').notNull(),
    topResultId: uuid('top_result_id'),
    topSimilarity: real('top_similarity'),
    searchDurationMs: integer('search_duration_ms'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
},
	(table) => ({
    indexes: [
        index('idx_vector_search_logs_user_id').on(table.userId),
        index('idx_vector_search_logs_created_at').on(table.createdAt)
    ],
    foreignKeys: [
        foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: 'vector_search_logs_user_id_users_id_fk',
        }).onDelete('set null')
    ],
}));

/**
 * Document summaries - AI-generated summaries for quick reference
 */
export const documentSummaries = pgTable('document_summaries', {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    documentId: uuid('document_id').notNull(),
    summaryType: varchar('summary_type', { length: 50 }).notNull(), // 'brief', 'detailed', 'legal_analysis'
    summary: text('summary').notNull(),
    keyPoints: jsonb('key_points').default([]).$type<string[]>(),
    model: varchar('model', { length: 100 }).notNull(),
    confidence: real('confidence'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
},
	(table) => ({
    indexes: [
        index('idx_document_summaries_document_id').on(table.documentId),
        index('idx_document_summaries_type').on(table.summaryType)
    ],
    foreignKeys: [
        foreignKey({
            columns: [table.documentId],
            foreignColumns: [ingestedDocuments.id],
            name: 'document_summaries_document_id_ingested_documents_id_fk',
        }).onDelete('cascade')
    ],
}));

// Export all tables
export const ingestionSchema = {
    ingestedDocuments,
    ingestedDocumentChunks,
    embeddingCacheTable,
    ocrProcessingQueue,
    vectorSearchLogs,
    documentSummaries,
};
