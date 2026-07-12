import { pgTable, uuid, text, timestamp, index, pgEnum, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { cases } from './legal-cases';
import { libraryDocuments } from './library-documents';
import { legalNodes } from './legal-nodes';

export const caseLinkCategoryEnum = pgEnum('case_link_category', [
  'charged_under', // primary charging statute
  'cited_authority', // authority cited in brief/motion
  'defense_authority', // defense-cited authority
  'court_ruling', // court's cited authority
  'related_regulation', // administrative regulation
  'constitutional_basis', // constitutional provision
  'sentencing_guideline', // sentencing reference
  'glossary_concept', // saved legal concept/definition for the case
]);

/**
 * Case ↔ Library corpus links.
 * Connects user cases to hierarchical legal authorities.
 * A case can link to a whole document (e.g., "18 U.S.C.") OR
 * a specific node (e.g., "18 U.S.C. § 1030(a)(2)").
 */
export const caseLibraryLinks = pgTable('case_library_links', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	caseId: uuid('case_id')
		.notNull()
		.references(() => cases.id, { onDelete: 'cascade' }),
	documentId: uuid('document_id')
		.references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	nodeId: uuid('node_id')
		.references(() => legalNodes.id, { onDelete: 'set null' }),
	category: caseLinkCategoryEnum('category').notNull().default('cited_authority'),
	relevanceScore: real('relevance_score'),                // AI-scored relevance 0..1
	citationText: text('citation_text'),                    // human-readable citation string
	notes: text('notes'),
	addedBy: uuid('added_by'),                              // user who linked it
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	caseIdx: index('case_lib_links_case_idx').on(table.caseId),
	docIdx: index('case_lib_links_doc_idx').on(table.documentId),
	nodeIdx: index('case_lib_links_node_idx').on(table.nodeId),
}));

// Relations
export const caseLibraryLinksRelations = relations(caseLibraryLinks, ({ one }) => ({
	case: one(cases, {
		fields: [caseLibraryLinks.caseId],
		references: [cases.id],
	}),
	document: one(libraryDocuments, {
		fields: [caseLibraryLinks.documentId],
		references: [libraryDocuments.id],
	}),
	node: one(legalNodes, {
		fields: [caseLibraryLinks.nodeId],
		references: [legalNodes.id],
	}),
}));

// Type inference
export type CaseLibraryLink = typeof caseLibraryLinks.$inferSelect;
export type NewCaseLibraryLink = typeof caseLibraryLinks.$inferInsert;
