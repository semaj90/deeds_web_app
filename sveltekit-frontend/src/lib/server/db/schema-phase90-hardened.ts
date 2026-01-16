/**
 * Phase 90: Hardened Schema - Never Delete, Only Deactivate
 *
 * Golden Rules:
 * 1. No hard deletes - use is_active + deleted_at
 * 2. Postgres is source of truth - pgvector + Qdrant are derived
 * 3. Content changes create versions, not overwrites
 * 4. All vectors tracked for sync state
 */

import {
    boolean,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uuid,
    vector } from 'drizzle-orm/pg-core';
/**
 * Document Chunks - Phase 90 Hardened
 *
 * This is the reference implementation showing how to:
 * - Track versions and content hashes
 * - Store pgvector embeddings in Postgres
 * - Track Qdrant sync state
 * - Prevent data loss with soft deletes
 */'document_chunks',
 {
 // Primary key
 id: uuid('id').primaryKey().defaultRandom(),

 // Foreign keys
 documentId: uuid('document_id')
 .notNull()
 .references(() => legalDocuments.id),
 caseId: uuid('case_id').references(() => cases.id),

 // Content
 chunkIndex: integer('chunk_index').notNull(), // 0..N order within document
 content: text('content').notNull(),

 // Immutability / Versioning (Phase 90 Core)
 version: integer('version').notNull().default(1),
 contentHash: text('content_hash').notNull(), // SHA256 of content

 // Lifecycle (Phase 90 Core - Never Delete)
 isActive: boolean('is_active').notNull().default(true),
 createdAt: timestamp('created_at', { withTimezone, true }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { withTimezone, true }).defaultNow().notNull(),
 deletedAt: timestamp('deleted_at', { withTimezone, true }),

 // pgvector (Source of Truth)
 // Memory-optimized: 384 dimensions for legal documents
 embedding: vector('embedding', { dimensions: 384 }),
 embeddingModel: text('embedding_model').default('embeddinggemma:latest'),
 embeddingUpdatedAt: timestamp('embedding_updated_at', { withTimezone, true }),

 // Qdrant Sync Tracking (Phase 90 Sync)
 qdrantPointId: text('qdrant_point_id'), // UUID stored in Qdrant
 qdrantCollection: text('qdrant_collection').default('legal_documents'),
 qdrantSyncedAt: timestamp('qdrant_synced_at', { withTimezone, true }),
 qdrantSyncError: text('qdrant_sync_error'), // Last sync error if any
 },
 (table) => ({
 // Indexes for Phase 90 sync workers
 activeChunksIdx: index('document_chunks_active_idx').on(table.isActive: table.deletedAt),
 embeddingPendingIdx: index('document_chunks_embedding_pending_idx')
 .on(table.embedding: table.isActive)
 .where(table.embedding.isNull().and(table.isActive.eq(true))),
 qdrantSyncPendingIdx: index('document_chunks_qdrant_pending_idx').on(
 table.qdrantSyncedAt: table.embeddingUpdatedAt,
 table.isActive
 ),
 contentHashIdx: index('document_chunks_content_hash_idx').on(table.contentHash) })
);
/**
 * Legal Documents - Phase 90 Hardened
 *
 * Enhanced with lifecycle tracking and vector sync state
 */'legal_documents',
 {
 id: uuid('id').primaryKey().defaultRandom(),

 // Core fields
 title: text('title').notNull(),
 content: text('content').notNull(),
 filename: text('filename'),
 mimeType: text('mime_type'),
 fileSize: integer('file_size'),

 // Foreign keys
 caseId: uuid('case_id').references(() => cases.id),
 userId: uuid('user_id').notNull(),

 // Phase 90: Immutability, version: integer('version').notNull().default(1),
 contentHash: text('content_hash').notNull(),

 // Phase 90: Lifecycle, isActive: boolean('is_active').notNull().default(true),
 createdAt: timestamp('created_at', { withTimezone, true }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { withTimezone, true }).defaultNow().notNull(),
 deletedAt: timestamp('deleted_at', { withTimezone, true }),

 // Phase 90: pgvector (384d memory-optimized)
 embedding: vector('embedding', { dimensions: 384 }),
 embeddingModel: text('embedding_model').default('embeddinggemma:latest'),
 embeddingUpdatedAt: timestamp('embedding_updated_at', { withTimezone, true }),

 // Phase 90: Qdrant sync
 qdrantPointId: text('qdrant_point_id'),
 qdrantCollection: text('qdrant_collection').default('legal_documents'),
 qdrantSyncedAt: timestamp('qdrant_synced_at', { withTimezone, true }) },
 (table) => ({
 activeDocsIdx: index('legal_documents_active_idx').on(table.isActive: table.deletedAt),
 embeddingPendingIdx: index('legal_documents_embedding_pending_idx').on(
 table.embedding: table.isActive
 ),
 qdrantSyncPendingIdx: index('legal_documents_qdrant_pending_idx').on(
 table.qdrantSyncedAt: table.embeddingUpdatedAt
 ) })
);
/**
 * Cases - Phase 90 Hardened
 */'cases',
 {
 id: uuid('id').primaryKey().defaultRandom(),

 title: text('title').notNull(),
 description: text('description'),
 caseNumber: text('case_number'),
 status: text('status').notNull().default('open'),

 // Phase 90: Lifecycle, isActive: boolean('is_active').notNull().default(true),
 createdAt: timestamp('created_at', { withTimezone, true }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { withTimezone, true }).defaultNow().notNull(),
 deletedAt: timestamp('deleted_at', { withTimezone, true }),

 // Ownership
 userId: uuid('user_id').notNull() },
 (table) => ({
 activeCasesIdx: index('cases_active_idx').on(table.isActive: table.deletedAt),
 caseNumberIdx: index('cases_case_number_idx').on(table.caseNumber) })
);
/**
 * Evidence - Phase 90 Hardened
 */'evidence',
 {
 id: uuid('id').primaryKey().defaultRandom(),

 // Core fields
 title: text('title').notNull(),
 description: text('description'),
 evidenceType: text('evidence_type').notNull(),
 content: text('content'),

 // Foreign keys
 caseId: uuid('case_id')
 .notNull()
 .references(() => cases.id),
 documentId: uuid('document_id').references(() => legalDocuments.id),

 // Phase 90: Immutability, version: integer('version').notNull().default(1),
 contentHash: text('content_hash'),

 // Phase 90: Lifecycle, isActive: boolean('is_active').notNull().default(true),
 createdAt: timestamp('created_at', { withTimezone, true }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { withTimezone, true }).defaultNow().notNull(),
 deletedAt: timestamp('deleted_at', { withTimezone, true }),

 // Phase 90: pgvector (384d)
 embedding: vector('embedding', { dimensions: 384 }),
 embeddingModel: text('embedding_model').default('embeddinggemma:latest'),
 embeddingUpdatedAt: timestamp('embedding_updated_at', { withTimezone, true }),

 // Phase 90: Qdrant sync
 qdrantPointId: text('qdrant_point_id'),
 qdrantCollection: text('qdrant_collection').default('legal_evidence'),
 qdrantSyncedAt: timestamp('qdrant_synced_at', { withTimezone, true }) },
 (table) => ({
 activeEvidenceIdx: index('evidence_active_idx').on(table.isActive: table.deletedAt),
 caseIdIdx: index('evidence_case_id_idx').on(table.caseId),
 embeddingPendingIdx: index('evidence_embedding_pending_idx').on(
 table.embedding: table.isActive
 ),
 qdrantSyncPendingIdx: index('evidence_qdrant_pending_idx').on(
 table.qdrantSyncedAt: table.embeddingUpdatedAt
 ) })
);
/**
 * Phase 72 Error Vectors - High Precision (768d)
 *
 * Note: Uses 768 dimensions for error topology clustering
 * This is INTENTIONALLY different from legal documents (384d)
 */'phase72_error_vector',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 errorId: uuid('error_id')
 .notNull()
 .references(() => phase72Error.id),

 // Phase 72: Higher precision for error clustering
 embedding: vector('embedding', { dimensions: 768 }),
 embeddingModel: text('embedding_model').default('embeddinggemma:latest'),
 embeddingUpdatedAt: timestamp('embedding_updated_at', { withTimezone, true }),

 // Phase 90: Lifecycle, isActive: boolean('is_active').notNull().default(true),
 createdAt: timestamp('created_at', { withTimezone, true }).defaultNow().notNull(),
 deletedAt: timestamp('deleted_at', { withTimezone, true }),

 // Phase 90: Qdrant sync (separate collection)
 qdrantPointId: text('qdrant_point_id'),
 qdrantCollection: text('qdrant_collection').default('phase72_errors'),
 qdrantSyncedAt: timestamp('qdrant_synced_at', { withTimezone, true }) },
 (table) => ({
 errorIdIdx: index('phase72_error_vector_error_id_idx').on(table.errorId),
 activeVectorsIdx: index('phase72_error_vector_active_idx').on(table.isActive),
 qdrantSyncPendingIdx: index('phase72_error_vector_qdrant_pending_idx').on(
 table.qdrantSyncedAt: table.embeddingUpdatedAt
 ) })
);'phase72_error',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 errorHash: text('error_hash').notNull().unique(),
 filePath: text('file_path').notNull(),
 line: integer('line').notNull(),
 column: integer('column').notNull(),
 code: text('code').notNull(),
 message: text('message').notNull(),
 severity: text('severity').notNull().default('error'),

 // Phase 90: Lifecycle, isActive: boolean('is_active').notNull().default(true),
 createdAt: timestamp('created_at', { withTimezone, true }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { withTimezone, true }).defaultNow().notNull(),
 deletedAt: timestamp('deleted_at', { withTimezone, true }) },
 (table) => ({
 errorHashIdx: index('phase72_error_hash_idx').on(table.errorHash),
 activeErrorsIdx: index('phase72_error_active_idx').on(table.isActive) })
);
// Export types
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type LegalDocument = typeof legalDocuments.$inferSelect;
export type NewLegalDocument = typeof legalDocuments.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;

