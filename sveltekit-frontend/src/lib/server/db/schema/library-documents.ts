import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { jurisdictions } from './jurisdictions';

// --- Enums matching DB migration (20260317_legal_library.sql + constitution_sources.sql) ---

export const sourceTypeEnum = pgEnum('source_type', [
	'upload',
	'govinfo',
	'state_official',
	'openstates',
	'lii_reference',
]);

export const corpusTypeEnum = pgEnum('corpus_type', [
	'constitution',
	'statute',
	'regulation',
	'bill',
	'case',
	'glossary',
	'treatise',
	'other',
]);

export const processingStatusEnum = pgEnum('processing_status', [
	'queued',
	'extracting',
	'ocr',
	'structuring',
	'chunking',
	'embedding',
	'graphing',
	'complete',
	'failed',
]);

/**
 * Library documents — one row per legal source document.
 * Constitutions, statutes, regulations, bills, case opinions, treatises.
 * Separate from the evidence-pipeline "documents" table.
 */
export const libraryDocuments = pgTable(
  'library_documents',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    sourceType: sourceTypeEnum('source_type').notNull().default('upload'),
    corpusType: corpusTypeEnum('corpus_type').notNull().default('other'),
    jurisdictionId: integer('jurisdiction_id').references(() => jurisdictions.id),
    title: text('title').notNull(),
    shortTitle: text('short_title'),
    citation: text('citation'), // e.g. "Cal. Const." / "18 U.S.C."
    officialUrl: text('official_url'),
    sourceHash: text('source_hash'), // SHA-256 of original file
    sourceConfidence: text('source_confidence').default('medium'), // high | medium | low
    sourceKind: text('source_kind').default('uploaded_pdf'), // official_state | lii_indexed | uploaded_pdf | scraped | api
    mimeType: text('mime_type').default('application/pdf'),
    minioKey: text('minio_key').notNull(),
    minioKeyNormalized: text('minio_key_normalized'),
    pageCount: integer('page_count'),
    effectiveDate: timestamp('effective_date', { mode: 'date' }),
    updatedAtSource: timestamp('updated_at_source', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    isOfficial: boolean('is_official').default(false),
    processingStatus: processingStatusEnum('processing_status').notNull().default('queued'),
    uploadedBy: integer('uploaded_by'), // FK to users.id (integer, Lucia-aligned; not enforced here to avoid circular dep)
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    jurisdictionIdx: index('library_docs_jurisdiction_idx').on(table.jurisdictionId),
    corpusIdx: index('library_docs_corpus_idx').on(table.corpusType),
    statusIdx: index('library_docs_status_idx').on(table.processingStatus),
    sourceHashUidx: uniqueIndex('library_docs_source_hash_uidx').on(table.sourceHash),
  })
);

// Type inference
export type LibraryDocument = typeof libraryDocuments.$inferSelect;
export type NewLibraryDocument = typeof libraryDocuments.$inferInsert;
