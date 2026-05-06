import { pgTable, text, timestamp, unique, jsonb, doublePrecision, uuid } from 'drizzle-orm/pg-core';

export const embeddedSummaries = pgTable(
	'embedded_summaries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		stableKey: text('stable_key').notNull(),
		sourceType: text('source_type').notNull(),
		sourceHash: text('source_hash').notNull(),
		summaryType: text('summary_type').notNull(),
		summaryText: text('summary_text').notNull(),
		summaryJson: jsonb('summary_json').default({}).notNull(),
		model: text('model').notNull(),
		embeddingModel: text('embedding_model').notNull(),
		qdrantCollection: text('qdrant_collection').notNull(),
		qdrantPointId: text('qdrant_point_id'),
		tags: text('tags').array().default([]).notNull(),
		confidence: doublePrecision('confidence').default(0.75).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		unique('embedded_summaries_stable_hash_type_uq').on(t.stableKey, t.sourceHash, t.summaryType)
	]
);
