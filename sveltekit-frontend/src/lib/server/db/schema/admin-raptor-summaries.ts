import { pgTable, text, timestamp, integer, uuid, jsonb } from 'drizzle-orm/pg-core';

export const adminRaptorSummaries = pgTable('admin_raptor_summaries', {
	id: uuid('id').defaultRandom().primaryKey(),
	level: integer('level').notNull().default(0),
	summary: text('summary').notNull(),
	source_clusters: jsonb('source_clusters').notNull(), // Array of cluster IDs
	metadata: jsonb('metadata'),
	created_at: timestamp('created_at').defaultNow().notNull(),
});
