import { pgTable, text, serial, timestamp, index, doublePrecision, jsonb } from 'drizzle-orm/pg-core';

export const retrievalProvenance = pgTable('retrieval_provenance', {
  id: serial('id').primaryKey(),
  storyId: text('story_id').notNull(),
  taskId: text('task_id').notNull(),
  workerId: text('worker_id').notNull(),
  traceId: text('trace_id'),
  queryHash: text('query_hash').notNull(),
  packetKey: text('packet_key').notNull(),
  packetId: text('packet_id'),
  packetUlid: text('packet_ulid'),
  sourceRef: text('source_ref').notNull(),
  canonicalSourceRef: text('canonical_source_ref'),
  sourceRefKey: text('source_ref_key'),
  featureId: text('feature_id').notNull(),
  titleId: text('title_id'),
  featureLabel: text('feature_label'),
  cacheNamespace: text('cache_namespace'),
  cacheKey: text('cache_key'),
  cacheHitSource: text('cache_hit_source'),
  graphStageStatus: text('graph_stage_status'),
  traversalPath: jsonb('traversal_path'),
  fusionScore: doublePrecision('fusion_score'),
  verdict: text('verdict'),
  retrievalStrategy: text('retrieval_strategy'),
  retrievalPath: jsonb('retrieval_path').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  storyTaskIdx: index('idx_rp_story_task').on(table.storyId, table.taskId),
  packetKeyIdx: index('idx_rp_packet_key').on(table.packetKey),
  packetIdIdx: index('idx_rp_packet_id').on(table.packetId),
  packetUlidIdx: index('idx_rp_packet_ulid').on(table.packetUlid),
  sourceRefIdx: index('idx_rp_source_ref').on(table.sourceRef),
  canonicalSourceRefIdx: index('idx_rp_canonical_source_ref').on(table.canonicalSourceRef),
  titleIdIdx: index('idx_rp_title_id').on(table.titleId),
  featureIdIdx: index('idx_rp_feature_id').on(table.featureId),
  queryHashIdx: index('idx_rp_query_hash').on(table.queryHash),
}));

export type RetrievalProvenance = typeof retrievalProvenance.$inferSelect;
export type NewRetrievalProvenance = typeof retrievalProvenance.$inferInsert;
