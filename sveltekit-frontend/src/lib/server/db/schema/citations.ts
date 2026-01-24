import { pgTable, text, uuid, timestamp, integer } from 'drizzle-orm/pg-core';

export const savedCitations = pgTable('saved_citations', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id').notNull(),
	caseId: text('case_id'),
	statuteCode: text('statute_code').notNull(),
	statuteTitle: text('statute_title'),
	jurisdiction: text('jurisdiction'),
	severity: text('severity'),
	year: integer('year'),
	sourceType: text('source_type').default('manual'), // 'manual' | 'auto_extracted'
	highlightedText: text('highlighted_text'),
	notes: text('notes'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date())
});



