import { index, integer, jsonb, pgTable, text, timestamp, unique, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Canonical codebase summary cards.
 *
 * Generated from the codebase graph + codebase map + atlas outputs and used
 * as the normalized retrieval source for summary, route, table, tool, error,
 * and test mappings.
 */
export const summaryCards = pgTable(
  'summary_cards',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cardKey: text('card_key').notNull(),
    path: text('path').notNull(),
    summaryType: text('summary_type').notNull(),
    summary: text('summary').notNull(),
    symbols: text('symbols').array().notNull().default(sql`'{}'::text[]`),
    routes: text('routes').array().notNull().default(sql`'{}'::text[]`),
    tables: text('tables').array().notNull().default(sql`'{}'::text[]`),
    tools: text('tools').array().notNull().default(sql`'{}'::text[]`),
    dependencies: text('dependencies').array().notNull().default(sql`'{}'::text[]`),
    labels: text('labels').array().notNull().default(sql`'{}'::text[]`),
    sourceRefs: text('source_refs').array().notNull().default(sql`'{}'::text[]`),
    search: jsonb('search').notNull().default(sql`'{}'::jsonb`),
    scores: jsonb('scores').notNull().default(sql`'{}'::jsonb`),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    embedding: vector('embedding', { dimensions: 768 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cardKeyUq: unique('summary_cards_card_key_uq').on(t.cardKey),
    pathIdx: index('idx_summary_cards_path').on(t.path),
    summaryTypeIdx: index('idx_summary_cards_summary_type').on(t.summaryType),
  }),
);

export type SummaryCard = typeof summaryCards.$inferSelect;
export type NewSummaryCard = typeof summaryCards.$inferInsert;
