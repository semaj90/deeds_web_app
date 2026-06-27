/**
 * PHASE 85a: Semantic Diff Results Table
 *
 * Logs every semantic diff comparison: old summary embedding vs new summary embedding.
 * Tracks which regenerations were skipped due to high similarity.
 */

import { pgTable, uuid, varchar, real, timestamp, text } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const atlas_semantic_diffs = pgTable('atlas_semantic_diffs', {
  diff_id: uuid('diff_id').primaryKey().defaultRandom(),
  packet_key: varchar('packet_key', { length: 255 }).notNull(),
  source_ref: varchar('source_ref', { length: 512 }).notNull(),

  // Cosine similarity between old and new summary embeddings (0.0 to 1.0)
  similarity: real('similarity').notNull(),

  // Recommendation: what action to take
  recommendation: varchar('recommendation', {
    length: 50,
    enum: ['skip', 'metadata_only', 'regenerate', 'gan_review', 'full_regeneration']
  }).notNull(),

  // What action was actually taken
  action_taken: varchar('action_taken', {
    length: 50,
    enum: ['skip', 'metadata_only', 'regenerate', 'gan_review', 'full_regeneration']
  }),

  // Estimated cost savings (0-100, percentage of regeneration cost avoided)
  regeneration_cost_saved: real('regeneration_cost_saved'),

  // Trace ID for linking to agent runs
  trace_id: uuid('trace_id'),

  // Notes
  notes: text('notes'),

  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export type AtlasSemanticDiff = typeof atlas_semantic_diffs.$inferSelect;
export type NewAtlasSemanticDiff = typeof atlas_semantic_diffs.$inferInsert;

export const insertSemanticDiffSchema = createInsertSchema(atlas_semantic_diffs);
export const selectSemanticDiffSchema = createSelectSchema(atlas_semantic_diffs);
