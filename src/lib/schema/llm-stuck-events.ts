import { pgTable, text, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core';

export const llmStuckEvents = pgTable('llm_stuck_events', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  agent: text('agent').notNull(),
  phase: text('phase').notNull(),
  query: text('query'),
  symptom: text('symptom').notNull(),
  retryQuery: text('retry_query'),
  sourceRefs: jsonb('source_refs').$type<string[]>().default([]),
  toolsTried: jsonb('tools_tried').$type<string[]>().default([]),
  cacheHit: boolean('cache_hit').default(false),
  dominantCluster: text('dominant_cluster'),
  similarityScore: real('similarity_score'),
  createdAt: timestamp('created_at').defaultNow()
});