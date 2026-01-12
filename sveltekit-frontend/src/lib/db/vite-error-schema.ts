import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, serial, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Vite Error Storage Schema with pgvector Integration
 *
 * Database schema for storing build errors, TypeScript diagnostics,
 * and their embeddings for similarity search and error tracking.
 */

export type ErrorCategory = 'syntax' | 'type' | 'runtime' | 'build' | 'lint' | 'other';

export interface ErrorMetadataJSON {
    tags?: string[];
    relatedFiles?: string[];
    stackTrace?: string[];
    buildContext?: { command: string;
        duration: string; exitCode: string;
    };
    similarErrors?: string[];
    suggestions?: string[];
    notes?: string;
}

export interface ClusterMetadataJSON {
    topErrorCodes?: string[];
    topFiles?: string[];
    avgResolutionTimeMs?: number;
    density?: number;
    algorithm?: 'dbscan' | 'kmeans' | 'hierarchical';
}

export const viteErrors = pgTable('vite_errors', {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    errorCode: text('error_code').notNull(),
    filePath: text('file_path').notNull(),
    line: integer('line').notNull(),
    column: integer('column').notNull(),
    message: text('message').notNull(),
    severity: text('severity').$type<'error' | 'warning' | 'info' | 'hint'>().notNull(),
    category: text('category').$type<ErrorCategory>().notNull(),
    source: text('source').$type<'typescript' | 'svelte' | 'vite' | 'eslint' | 'custom'>().notNull(),
    rawText: text('raw_text').notNull(),
    embedding: vector('embedding', { dimensions: 768 }),
    metadata: jsonb('metadata').$type<ErrorMetadataJSON>(),
    isActive: boolean('is_active').default(true).notNull(),
    occurrenceCount: integer('occurrence_count').default(1).notNull(),
    firstSeen: timestamp('first_seen', { mode: 'string' }).defaultNow().notNull(),
    lastSeen: timestamp('last_seen', { mode: 'string' }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull()
});

export const errorClusters = pgTable('error_clusters', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    errorCount: integer('error_count').default(0).notNull(),
    centroid: vector('centroid', { dimensions: 768 }),
    metadata: jsonb('metadata').$type<ClusterMetadataJSON>(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull()
});

export const errorClusterMembership = pgTable('error_cluster_membership', {
    id: serial('id').primaryKey(),
    errorId: uuid('error_id').notNull().references(() => viteErrors.id, { onDelete: 'cascade' }),
    clusterId: integer('cluster_id').notNull().references(() => errorClusters.id, { onDelete: 'cascade' }),
    distance: text('distance').notNull(), // Using text for float/decimal if needed, or real/doublePrecision
    confidence: text('confidence').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull()
});

export const errorHistory = pgTable('error_history', {
    id: serial('id').primaryKey(),
    snapshotAt: timestamp('snapshot_at', { mode: 'string' }).defaultNow().notNull(),
    totalErrors: integer('total_errors').notNull(),
    errorsBySeverity: jsonb('errors_by_severity').$type<Record<string, number>>(),
    errorsByCategory: jsonb('errors_by_category').$type<Record<string, number>>(),
    errorsBySource: jsonb('errors_by_source').$type<Record<string, number>>(),
    topErrorCodes: jsonb('top_error_codes').$type<Array<{ code: string; count: number }>>(),
    topFiles: jsonb('top_files').$type<Array<{ path: string; count: number }>>(),
    buildMetadata: jsonb('build_metadata').$type<{ command: string; duration: string; exitCode: string; timestamp: string }>(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull()
});

export const errorQueryCache = pgTable('error_query_cache', {
    id: serial('id').primaryKey(),
    queryText: text('query_text').notNull(),
    queryEmbedding: vector('query_embedding', { dimensions: 768 }),
    resultIds: jsonb('result_ids').$type<string[]>(),
    hitCount: integer('hit_count').default(0).notNull(),
    ttlSeconds: integer('ttl_seconds').default(3600).notNull(),
    expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull()
});

export const errorSimilarity = pgTable('error_similarity', {
    id: serial('id').primaryKey(),
    errorId1: uuid('error_id_1').notNull().references(() => viteErrors.id, { onDelete: 'cascade' }),
    errorId2: uuid('error_id_2').notNull().references(() => viteErrors.id, { onDelete: 'cascade' }),
    similarity: text('similarity').notNull(),
    computedAt: timestamp('computed_at', { mode: 'string' }).defaultNow().notNull()
});

export type ViteError = typeof viteErrors.$inferSelect;
export type NewViteError = typeof viteErrors.$inferInsert;
export type ErrorCluster = typeof errorClusters.$inferSelect;
export type NewErrorCluster = typeof errorClusters.$inferInsert;
export type ErrorClusterMembership = typeof errorClusterMembership.$inferSelect;
export type NewErrorClusterMembership = typeof errorClusterMembership.$inferInsert;
export type ErrorHistory = typeof errorHistory.$inferSelect;
export type NewErrorHistory = typeof errorHistory.$inferInsert;
export type ErrorQueryCache = typeof errorQueryCache.$inferSelect;
export type NewErrorQueryCache = typeof errorQueryCache.$inferInsert;
export type ErrorSimilarity = typeof errorSimilarity.$inferSelect;
export type NewErrorSimilarity = typeof errorSimilarity.$inferInsert;




