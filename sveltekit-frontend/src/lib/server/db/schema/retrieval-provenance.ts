import { pgTable, text, serial, timestamp, index, doublePrecision, jsonb } from 'drizzle-orm/pg-core';

export const retrievalProvenance = pgTable('retrieval_provenance', {
  id: serial('id').primaryKey(),
  storyId: text('story_id').notNull(),
  taskId: text('task_id').notNull(),
  workerId: text('worker_id').notNull(),
  traceId: text('trace_id'),
  queryHash: text('query_hash').notNull(),
  packetKey: text('packet_key').notNull(),
  sourceRef: text('source_ref').notNull(),
  sourceRefKey: text('source_ref_key'),
  featureId: text('feature_id').notNull(),
  featureLabel: text('feature_label'),
  cacheNamespace: text('cache_namespace'),
  cacheKey: text('cache_key'),
  cacheHitSource: text('cache_hit_source'),
  graphStageStatus: text('graph_stage_status'),
  traversalPath: jsonb('traversal_path'),
  fusionScore: doublePrecision('fusion_score'),
  verdict: text('verdict'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  storyTaskIdx: index('idx_rp_story_task').on(table.storyId, table.taskId),
  packetKeyIdx: index('idx_rp_packet_key').on(table.packetKey),
  sourceRefIdx: index('idx_rp_source_ref').on(table.sourceRef),
  featureIdIdx: index('idx_rp_feature_id').on(table.featureId),
  queryHashIdx: index('idx_rp_query_hash').on(table.queryHash),
}));

export type RetrievalProvenance = typeof retrievalProvenance.$inferSelect;
export type NewRetrievalProvenance = typeof retrievalProvenance.$inferInsert;
