import { pgTable, uuid, text, integer, timestamp, pgEnum, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { libraryDocuments } from './library-documents';
import { libraryDocumentVersions } from './library-document-versions';

export const legalNodeTypeEnum = pgEnum('legal_node_type', [
	'document',
	'title',
	'article',
	'chapter',
	'part',
	'section',
	'subsection',
	'paragraph',
	'clause',
	'definition',
	'appendix',
	'note',
]);

/**
 * Legal hierarchy nodes — the most important table.
 * One row per structural unit: title, article, chapter, section, subsection, etc.
 * Tree structure via parent_node_id + materialized node_path for fast traversal.
 * Supports TOC, breadcrumbs, article/section navigation, parent-child tree traversal.
 */
export const legalNodes = pgTable('legal_nodes', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	documentId: uuid('document_id').notNull().references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	versionId: uuid('version_id').references(() => libraryDocumentVersions.id, { onDelete: 'cascade' }),
	parentNodeId: uuid('parent_node_id'),             // self-referential tree
	nodeType: legalNodeTypeEnum('node_type').notNull().default('section'),
	ordinal: text('ordinal'),                         // I, 1, (a), (1) — text for Roman/alpha
	heading: text('heading'),
	citationLabel: text('citation_label'),             // e.g. "Art. I, § 1"
	nodePath: text('node_path').notNull(),             // "article-i/section-1" materialized path
	depth: integer('depth').notNull().default(0),
	pageStart: integer('page_start'),
	pageEnd: integer('page_end'),
	charStart: integer('char_start'),
	charEnd: integer('char_end'),
	fullText: text('full_text').notNull(),
	textClean: text('text_clean').notNull(),
	tagsJson: jsonb('tags_json').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	documentIdx: index('legal_nodes_doc_idx').on(table.documentId),
	parentIdx: index('legal_nodes_parent_idx').on(table.parentNodeId),
	pathIdx: index('legal_nodes_path_idx').on(table.documentId, table.nodePath),
	citationIdx: index('idx_legal_nodes_citation').on(table.citationLabel),
}));

// Type inference
export type LegalNode = typeof legalNodes.$inferSelect;
export type NewLegalNode = typeof legalNodes.$inferInsert;
