import { index, integer, jsonb, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

/**
 * Error Clusters
 * Groups similar errors from CUDA embedding + k-means clustering (Phase 78)
 * One cluster per unique error pattern; helps identify systemic issues
 */'error_cluster',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    routeId: text('route_id').notNull(),
    tool: text('tool').notNull(),
    code: text('code').notNull(),
    message: text('message').notNull(),
    severity: text('severity').notNull().default('medium'),
    count: integer('count').notNull().default(1),
    filePath: text('file_path'),
    rawLogSnippet: text('raw_log_snippet'),

    // Cluster metadata
    clusterId: text('cluster_id').unique(),
    errorCode: text('error_code'),
    category: text('category'),
    affectedRoutes: jsonb('affected_routes'),

    // Vector embedding (384 dimensions for embeddinggemma)
    embedding: vector('embedding', { dimensions: 384 }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone, true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone, true }).defaultNow()
  },
  (table) => {
    return {
      clusterIdIdx: index('idx_error_cluster_id').on(table.clusterId),
      errorCodeIdx: index('idx_error_cluster_code').on(table.errorCode)
    };
  }
);

export type ErrorCluster = typeof errorClusterTable.$inferSelect;
export type NewErrorCluster = typeof errorClusterTable.$inferInsert;


