-- atlas_feature_map: Qdrant-derived source_ref -> feature_id -> centroid_id -> som_cluster -> qdrant_point_id
-- lineage table. Referenced by scripts/atlas/sync-atlas-feature-map-from-qdrant.mjs since before
-- this migration existed -- the table was missing entirely (confirmed live: `\dt` showed
-- atlas_feature_map_history / atlas_feature_map_synthesized / atlas_feature_packets / feature_maps,
-- but no atlas_feature_map), causing every apply run to fail with
-- `relation "atlas_feature_map" does not exist` while the script's own success log printed
-- unconditionally regardless (separate bug, fixed in the script itself).
--
-- Schema derived directly from the script's own UPSERT statement and value bindings -- not
-- guessed. This is a derived/rebuildable mirror (Qdrant is the source), safe to create fresh.

CREATE TABLE IF NOT EXISTS atlas_feature_map (
  normalized_path      text PRIMARY KEY,
  source_ref           text NOT NULL,
  feature_id           text,
  related_feature_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  cluster_id           text,
  centroid_id          text,
  som_cluster          text,
  qdrant_point_id      text,
  lane_ids             text[] NOT NULL DEFAULT '{}'::text[],
  packet_id            text,
  indexed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_feature_id ON atlas_feature_map(feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_som_cluster ON atlas_feature_map(som_cluster);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_qdrant_point_id ON atlas_feature_map(qdrant_point_id);
