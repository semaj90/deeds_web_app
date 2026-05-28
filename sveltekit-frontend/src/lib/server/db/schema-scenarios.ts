import { pgTable, uuid, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const scenarios = pgTable('scenarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  source_ref: varchar('source_ref', { length: 255 }).notNull(),
  content_hash: varchar('content_hash', { length: 128 }).notNull(),
  name: text('name'),
  description: text('description'),
  metadata: jsonb('metadata').$type<any>().default('{}'),
  embedding: vector('embedding', { dimensions: 768 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export type Scenario = typeof scenarios.$inferSelect;
export type NewScenario = typeof scenarios.$inferInsert;
