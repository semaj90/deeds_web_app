import { pgTable, uuid, text, real, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { legalNodes } from './legal-nodes';

/**
 * Legal definitions — glossary terms defined within documents.
 * Links terms to their source node for provenance.
 */
export const legalDefinitions = pgTable('legal_definitions', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	term: text('term').notNull(),
	normalizedTerm: text('normalized_term').notNull(),
	definedInNodeId: uuid('defined_in_node_id').references(() => legalNodes.id, { onDelete: 'cascade' }),
	definitionText: text('definition_text').notNull(),
	confidence: real('confidence').default(1.0),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	termIdx: index('legal_defs_term_idx').on(table.normalizedTerm),
	nodeIdx: index('idx_legal_definitions_node_id').on(table.definedInNodeId),
}));

// Type inference
export type LegalDefinition = typeof legalDefinitions.$inferSelect;
export type NewLegalDefinition = typeof legalDefinitions.$inferInsert;
