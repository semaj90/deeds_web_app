import { pgTable, text, index, integer, doublePrecision, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const queryCacheMetrics = pgTable('query_cache_metrics', {
  queryHash: text('query_hash').primaryKey(),
  lastTraceId: text('last_trace_id'),
  cacheNamespace: text('cache_namespace'),
  cacheHitSource: text('cache_hit_source'),
  accessCount: integer('access_count').default(0).notNull(),
  hitCount: integer('hit_count').default(0).notNull(),
  avgLatencyMs: doublePrecision('avg_latency_ms'),
  lastAccessed: timestamp('last_accessed', { withTimezone: true }).defaultNow().notNull(),
  payload: jsonb('payload').default({}).notNull(),
}, (table) => ({
  lastAccessedIdx: index('idx_qcm_last_accessed').on(table.lastAccessed),
  avgLatencyIdx: index('idx_qcm_avg_latency').on(table.avgLatencyMs),
  namespaceIdx: index('idx_qcm_namespace').on(table.cacheNamespace),
  hitSourceIdx: index('idx_qcm_hit_source').on(table.cacheHitSource),
}));

export type QueryCacheMetrics = typeof queryCacheMetrics.$inferSelect;
export type NewQueryCacheMetrics = typeof queryCacheMetrics.$inferInsert;
