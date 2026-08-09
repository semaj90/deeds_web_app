-- parent_atlas_documents is a view over atlas_packets. No tracked migration source existed for
-- it (created ad hoc in an earlier session) -- this file makes it declarative and fixes a real
-- bug found 2026-08-09: scripts/atlas/offline-parent-atlas-mapreduce.sql (part of
-- `npm run graphify:daily`'s DuckDB cold-processing step) selects pad.workspace_id, which this
-- view never exposed, causing every graphify:daily run to fail with
-- `Table "pad" does not have a column named "workspace_id"`.
--
-- atlas_packets does have both workspace_id and updated_at (confirmed live via
-- information_schema.columns) -- this widens the view to expose them. The SQL script also
-- references pad.file_ext / pad.alias_id / pad.ingest_source, which genuinely don't exist
-- anywhere (not on atlas_packets, not derivable from payload) -- those are fixed separately in
-- the SQL script itself, not here.

CREATE OR REPLACE VIEW parent_atlas_documents AS
SELECT
  packet_key AS id,
  source_ref,
  directory_path AS rel_path,
  feature_id,
  COALESCE((payload ->> 'line_count')::integer, 0) AS line_count,
  COALESCE((payload ->> 'is_route')::boolean, false) AS is_route,
  COALESCE((payload ->> 'is_svelte_comp')::boolean, false) AS is_svelte_comp,
  COALESCE((payload ->> 'has_zod')::boolean, false) AS has_zod,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'drizzle_refs')), ARRAY[]::text[]) AS drizzle_refs,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'imports')), ARRAY[]::text[]) AS imports,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'exports')), ARRAY[]::text[]) AS exports,
  qdrant_point_id,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'related_feature_ids')), ARRAY[]::text[]) AS related_feature_ids,
  COALESCE((payload ->> 'has_auth')::boolean, false) AS has_auth,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'route_handlers')), ARRAY[]::text[]) AS route_handlers,
  COALESCE(tags, ARRAY[]::text[]) AS tags,
  kmeans_cluster::text AS cluster_id,
  som_cluster AS centroid_id,
  packet_key,
  feature_label,
  created_at,
  workspace_id,
  updated_at
FROM atlas_packets ap
WHERE source_ref IS NOT NULL;
