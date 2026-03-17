import { pgTable, uuid, text, real, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { legalNodes } from './legal-nodes';

export const citationTypeEnum = pgEnum('citation_type', [
	'statutory',
	'constitutional',
	'regulatory',
	'judicial',
	'other',
]);

/**
 * Legal cross-references — links between legal nodes.
 * Enables: cited by, cites, related authority, linked glossary sources.
 * to_node_id is nullable: the target might not be ingested yet.
 */
export const legalCitations = pgTable('legal_citations', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	fromNodeId: uuid('from_node_id').notNull().references(() => legalNodes.id, { onDelete: 'cascade' }),
	toNodeId: uuid('to_node_id').references(() => legalNodes.id, { onDelete: 'set null' }),
	citationText: text('citation_text').notNull(),
	citationType: citationTypeEnum('citation_type').default('other').notNull(),
	normalizedTarget: text('normalized_target'),      // e.g. 'Cal. Const. art. I, § 1'
	confidence: real('confidence').default(1.0),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	fromIdx: index('idx_legal_citations_from').on(table.fromNodeId),
	toIdx: index('idx_legal_citations_to').on(table.toNodeId),
	targetIdx: index('idx_legal_citations_target').on(table.normalizedTarget),
}));

// Type inference
export type LegalCitation = typeof legalCitations.$inferSelect;
export type NewLegalCitation = typeof legalCitations.$inferInsert;
