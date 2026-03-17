import { pgTable, uuid, integer, text, boolean, numeric, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { libraryDocuments } from './library-documents';

/**
 * Page artifacts — per-page extraction bookkeeping.
 * Tracks native text vs OCR output per page, with confidence scoring.
 */
export const pageArtifacts = pgTable('page_artifacts', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	documentId: uuid('document_id').notNull().references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	pageNumber: integer('page_number').notNull(),
	imageMinioKey: text('image_minio_key'),           // processed/pages/{docId}/page-0001.webp
	extractedText: text('extracted_text'),             // native PDF text
	ocrText: text('ocr_text'),                        // Tesseract output
	finalText: text('final_text'),                    // best of native vs OCR
	hasNativeText: boolean('has_native_text').default(false),
	ocrConfidence: numeric('ocr_confidence', { precision: 5, scale: 4 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	docPageUnique: unique('page_artifacts_doc_page_uniq').on(table.documentId, table.pageNumber),
	docIdx: index('page_artifacts_doc_idx').on(table.documentId),
}));

// Type inference
export type PageArtifact = typeof pageArtifacts.$inferSelect;
export type NewPageArtifact = typeof pageArtifacts.$inferInsert;
