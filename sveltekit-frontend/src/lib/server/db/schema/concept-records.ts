import { pgTable, text, jsonb, timestamp, integer, doublePrecision } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const conceptRecords = pgTable('concept_records', {
  conceptId: text('concept_id').primaryKey(),
  evidence: jsonb('evidence').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  featureIds: jsonb('feature_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  somClusters: jsonb('som_clusters').$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  retrievalCount: integer('retrieval_count').notNull().default(0),
  repairSuccess: doublePrecision('repair_success').notNull().default(1.0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export type ConceptRecord = typeof conceptRecords.$inferSelect;
export type NewConceptRecord = typeof conceptRecords.$inferInsert;
