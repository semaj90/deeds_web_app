import { pgTable, text, integer, jsonb, timestamp, vector, doublePrecision, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const ragCards = pgTable('rag_cards', {
  id: text('id').primaryKey(),
  filePath: text('file_path').notNull(),
  featureLabel: text('feature_label').notNull(),
  summary: text('summary').notNull(),
  tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`)
});

export const ragEmbeddings = pgTable('rag_embeddings', {
  id: text('id').primaryKey(),
  cardId: text('card_id').references(() => ragCards.id, { onDelete: 'cascade' }),
  embedding: vector('embedding', { dimensions: 768 }),
  embeddingType: text('embedding_type').notNull().default('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`)
});

export const ragEdges = pgTable('rag_edges', {
  id: serial('id').primaryKey(),
  sourceCardId: text('source_card_id').notNull().references(() => ragCards.id, { onDelete: 'cascade' }),
  targetCardId: text('target_card_id').notNull(),
  relationship: text('relationship').notNull().default('depends_on'),
  weight: doublePrecision('weight').notNull().default(1.0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`)
});

export const acePackets = pgTable('ace_packets', {
  id: text('id').primaryKey(), // cacheKey or hash
  query: text('query').notNull(),
  contextHash: text('context_hash').notNull(),
  tokenUsed: integer('token_used').notNull().default(0),
  selectedSources: jsonb('selected_sources').notNull().default(sql`'[]'::jsonb`),
  contextMarkdown: text('context_markdown').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`)
});

export const clusterCards = pgTable('cluster_cards', {
  id: text('id').primaryKey(), // e.g. cluster_key
  clusterId: integer('cluster_id').notNull(),
  centroidLabel: text('centroid_label').notNull(),
  topTags: jsonb('top_tags').notNull().default(sql`'[]'::jsonb`),
  topFiles: jsonb('top_files').notNull().default(sql`'[]'::jsonb`),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`)
});
