import { index, integer, jsonb, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';
// import { vector } from 'drizzle-orm/pg-vector';

/**
 * Error Clusters
 * Groups similar errors from CUDA embedding + k-means clustering (Phase 78)
 * One cluster per unique error pattern; helps identify systemic issues
 */
export const errorClusterTable = pgTable(
  'error_cluster',
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
    firstSeenAt: timestamp('first_seen_at', { withTimezone: false }).defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: false }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: false }),
    archivedAt: timestamp('archived_at', { withTimezone: false }),
  },
  (table) => {
    return {
      clusterIdIdx: index('idx_error_cluster_cluster_id').on(table.clusterId),
      severityIdx: index('idx_error_cluster_severity').on(table.severity),
      categoryIdx: index('idx_error_cluster_category').on(table.category),
      updatedAtIdx: index('idx_error_cluster_updated_at').on(table.updatedAt),
    };
  }
);

export type ErrorCluster = typeof errorClusterTable.$inferSelect;
export type ErrorClusterInsert = typeof errorClusterTable.$inferInsert;export type ErrorCluster = typeof errorClustersTable.$inferSelect;
export type ErrorClusterInsert = typeof errorClustersTable.$inferInsert;
