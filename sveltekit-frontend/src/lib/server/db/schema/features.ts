/**
 * src/lib/server/db/schema/features.ts
 *
 * Database schema for FeatureMap persistence.
 * Stores compiled feature definitions, graph triples, and bit-glyphs.
 */

import {
  jsonb,
  pgTable,
  text,
  timestamp,
  bigint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const featureMaps = pgTable('feature_maps', {
  id:          text('id').primaryKey(), // e.g. 'feature:cs:topological-sort-corpus'
  name:        text('name').notNull(),
  description: text('description'),
  status:      text('status').notNull().default('stable'),
  
  // Scoped path mappings
  paths:       jsonb('paths').notNull().default(sql`'{}'::jsonb`),
  
  // Graph state (triples serialized as JSONB)
  graphTriples: jsonb('graph_triples').notNull().default(sql`'[]'::jsonb`),
  
  // Flags & Glyph
  flags:       bigint('flags', { mode: 'bigint' }).notNull().default(0n),
  glyph:       text('glyph'), // Base64 encoded binary glyph (8x8)
  
  metadata:    jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export type FeatureMapRow    = typeof featureMaps.$inferSelect;
export type NewFeatureMapRow = typeof featureMaps.$inferInsert;
