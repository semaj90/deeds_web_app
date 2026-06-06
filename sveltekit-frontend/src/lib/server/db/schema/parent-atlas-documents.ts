import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Parent Atlas document mirror.
 *
 * This table is the promotion target for source_ref-first codebase indexing.
 * It mirrors the manual SQL sidecar in drizzle/manual/20260601_add_alias_and_parent_atlas_indexes.sql.
 */
export const parentAtlasDocuments = pgTable('parent_atlas_documents', {
  id: integer('id').primaryKey(),
  sourceRef: text('source_ref').notNull(),
  featureId: text('feature_id'),
  workspaceId: text('workspace_id'),
  relPath: text('rel_path'),
  fileExt: text('file_ext'),
  tags: text('tags').array(),
  summary: text('summary'),
  lineCount: integer('line_count'),
  isRoute: boolean('is_route').default(false),
  isSvelteComp: boolean('is_svelte_comp').default(false),
  hasAuth: boolean('has_auth').default(false),
  hasZod: boolean('has_zod').default(false),
  drizzleRefs: jsonb('drizzle_refs'),
  imports: jsonb('imports'),
  exports: jsonb('exports'),
  routeHandlers: jsonb('route_handlers'),
  payload: jsonb('payload'),
  clusterId: text('cluster_id'),
  centroidId: text('centroid_id'),
  qdrantPointId: text('qdrant_point_id'),
  aliasId: text('alias_id'),
  relatedFeatureIds: jsonb('related_feature_ids').notNull().default(sql`'[]'::jsonb`),
  sourceKind: text('source_kind').default('source'),
  profileCardVisible: boolean('profile_card_visible').default(true),
  indexLane: text('index_lane').default('source'),
  summaryLod0: text('summary_lod0'),
  summaryLod1: text('summary_lod1'),
  summaryLod2: text('summary_lod2'),
  sourceRefId: integer('source_ref_id'),
  ingestSource: text('ingest_source').notNull().default('codebase-graph'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceRefWorkspaceUq: uniqueIndex('parent_atlas_documents_source_ref_workspace_uq').on(table.sourceRef, table.workspaceId),
  sourceRefIdx: index('idx_pad_source_ref').on(table.sourceRef),
  indexLaneIdx: index('idx_pad_index_lane').on(table.indexLane),
  lod1Idx: index('idx_pad_lod1').on(table.summaryLod1),
  featureIdIdx: index('idx_pad_feature_id').on(table.featureId),
  workspaceIdIdx: index('idx_pad_workspace_id').on(table.workspaceId),
  clusterIdIdx: index('idx_pad_cluster_id').on(table.clusterId),
  aliasIdIdx: index('idx_pad_alias_id').on(table.aliasId),
  sourceKindIdx: index('idx_pad_source_kind').on(table.sourceKind),
  sourceRefIdIdx: index('idx_pad_source_ref_id').on(table.sourceRefId),
  relatedFeatureIdsGin: index('idx_parent_atlas_documents_related_feature_ids_gin').using('gin', table.relatedFeatureIds),
  qdrantPointIdIdx: index('idx_pad_qdrant_point_id').on(table.qdrantPointId),
  tagsGin: index('idx_pad_tags_gin').using('gin', table.tags),
  payloadGin: index('idx_pad_payload_gin').using('gin', table.payload),
}));

export type ParentAtlasDocument = typeof parentAtlasDocuments.$inferSelect;
export type NewParentAtlasDocument = typeof parentAtlasDocuments.$inferInsert;
