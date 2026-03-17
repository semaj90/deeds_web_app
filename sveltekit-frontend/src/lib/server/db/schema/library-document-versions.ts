import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { libraryDocuments } from './library-documents';

/**
 * Library document versions — one row per version or amendment state.
 * Supports: current, historical, amended, compare versions.
 * Self-referencing parent_version_id for lineage tracking.
 */
export const libraryDocumentVersions = pgTable('library_document_versions', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	documentId: uuid('document_id').notNull().references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	versionLabel: text('version_label'),              // e.g. "2024 Amendment", "v1"
	sourceDate: timestamp('source_date', { mode: 'date' }),
	isCurrent: boolean('is_current').default(false),
	parentVersionId: uuid('parent_version_id'),       // self-referential for lineage
	diffSummary: text('diff_summary'),
	amendmentNote: text('amendment_note'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Type inference
export type LibraryDocumentVersion = typeof libraryDocumentVersions.$inferSelect;
export type NewLibraryDocumentVersion = typeof libraryDocumentVersions.$inferInsert;
