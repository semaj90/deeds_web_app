import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, jsonb, index, unique, uuid } from 'drizzle-orm/pg-core';

export const repoFunctionRegistry = pgTable(
  'repo_function_registry',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    sourceRef: text('source_ref').notNull(),
    filePath: text('file_path'),
    symbol: text('symbol').notNull(),
    kind: text('kind').notNull(),
    featureId: text('feature_id').notNull(),
    featureLabel: text('feature_label').notNull(),
    runtimeLane: text('runtime_lane'),
    workflowLane: text('workflow_lane').array().notNull().default(sql`'{}'::text[]`),
    permissionLane: text('permission_lane'),
    keywords: text('keywords').array().notNull().default(sql`'{}'::text[]`),
    summary: text('summary'),
    copyMergeUse: text('copy_merge_use'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sourceRefUnique: unique('repo_function_registry_source_ref_unique').on(table.sourceRef),
    featureIdUnique: unique('repo_function_registry_feature_id_unique').on(table.featureId),
    featureIdIdx: index('idx_repo_function_registry_feature_id').on(table.featureId),
    kindIdx: index('idx_repo_function_registry_kind').on(table.kind),
    runtimeLaneIdx: index('idx_repo_function_registry_runtime_lane').on(table.runtimeLane),
    permissionLaneIdx: index('idx_repo_function_registry_permission_lane').on(table.permissionLane),
    workflowLaneGin: index('idx_repo_function_registry_workflow_lane_gin').using('gin', table.workflowLane),
    keywordsGin: index('idx_repo_function_registry_keywords_gin').using('gin', table.keywords),
    metadataGin: index('idx_repo_function_registry_metadata_gin').using('gin', table.metadata),
    updatedAtIdx: index('idx_repo_function_registry_updated_at').on(sql`${table.updatedAt} DESC`),
  }),
);

export type RepoFunctionRegistryRow = typeof repoFunctionRegistry.$inferSelect;
export type NewRepoFunctionRegistryRow = typeof repoFunctionRegistry.$inferInsert;
