import { boolean, integer, pgView, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Parent Atlas document read model (PostgreSQL View).
 *
 * This view is a projected read model over atlas_packets.
 * PostgreSQL relkind = 'v'. It does NOT have physical table columns or indexes.
 *
 * Underlying atlas_packets mapping:
 *   packet_key -> id (text)
 *   source_ref -> source_ref (text)
 *   directory_path -> rel_path (text)
 *   feature_id -> feature_id (text)
 *   COALESCE((payload ->> 'line_count')::int, 0) -> line_count (integer)
 *   COALESCE((payload ->> 'is_route')::bool, false) -> is_route (boolean)
 *   COALESCE((payload ->> 'is_svelte_comp')::bool, false) -> is_svelte_comp (boolean)
 *   COALESCE((payload ->> 'has_zod')::bool, false) -> has_zod (boolean)
 *   COALESCE(ARRAY(...), ARRAY[]::text[]) -> drizzle_refs (text[])
 *   COALESCE(ARRAY(...), ARRAY[]::text[]) -> imports (text[])
 *   COALESCE(ARRAY(...), ARRAY[]::text[]) -> exports (text[])
 *   qdrant_point_id -> qdrant_point_id (text)
 *   COALESCE(ARRAY(...), ARRAY[]::text[]) -> related_feature_ids (text[])
 *   COALESCE((payload ->> 'has_auth')::bool, false) -> has_auth (boolean)
 *   COALESCE(ARRAY(...), ARRAY[]::text[]) -> route_handlers (text[])
 *   COALESCE(tags, ARRAY[]::text[]) -> tags (text[])
 *   kmeans_cluster::text -> cluster_id (text)
 *   som_cluster -> centroid_id (text)
 *   packet_key -> packet_key (text)
 *   feature_label -> feature_label (text)
 *   created_at -> created_at (timestamptz)
 *   workspace_id -> workspace_id (varchar)
 *   updated_at -> updated_at (timestamptz)
 */
export const parentAtlasDocuments = pgView('parent_atlas_documents', {
  id: text('id'),
  sourceRef: text('source_ref'),
  relPath: text('rel_path'),
  featureId: text('feature_id'),
  lineCount: integer('line_count'),
  isRoute: boolean('is_route'),
  isSvelteComp: boolean('is_svelte_comp'),
  hasZod: boolean('has_zod'),
  drizzleRefs: text('drizzle_refs').array(),
  imports: text('imports').array(),
  exports: text('exports').array(),
  qdrantPointId: text('qdrant_point_id'),
  relatedFeatureIds: text('related_feature_ids').array(),
  hasAuth: boolean('has_auth'),
  routeHandlers: text('route_handlers').array(),
  tags: text('tags').array(),
  clusterId: text('cluster_id'),
  centroidId: text('centroid_id'),
  packetKey: text('packet_key'),
  featureLabel: text('feature_label'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  workspaceId: text('workspace_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}).existing();

export type ParentAtlasDocument = typeof parentAtlasDocuments.$inferSelect;

