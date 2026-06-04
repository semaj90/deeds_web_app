-- atlas_feature_map: canonical source_ref → feature lineage table
-- One row per source_ref. Joins Qdrant, Neo4j, NES, and SOM into one truth.
-- Applied manually: psql $DATABASE_URL -f drizzle/manual/atlas_feature_map.sql

CREATE TABLE IF NOT EXISTS atlas_feature_map (
    source_ref            TEXT         PRIMARY KEY,
    feature_id            TEXT,
    related_feature_ids   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    cluster_id            TEXT,
    centroid_id           TEXT,
    som_cluster           TEXT,
    qdrant_point_id       TEXT,
    neo4j_node_id         TEXT,
    nes_card_id           TEXT,
    lane_ids              TEXT[]       NOT NULL DEFAULT '{}',
    atlas_version         INTEGER      NOT NULL DEFAULT 1,
    indexed_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_feature_map_feature_id_idx
    ON atlas_feature_map (feature_id);

CREATE INDEX IF NOT EXISTS atlas_feature_map_som_cluster_idx
    ON atlas_feature_map (som_cluster);

CREATE INDEX IF NOT EXISTS atlas_feature_map_cluster_id_idx
    ON atlas_feature_map (cluster_id);

CREATE INDEX IF NOT EXISTS atlas_feature_map_related_gin
    ON atlas_feature_map USING gin (related_feature_ids);

CREATE INDEX IF NOT EXISTS atlas_feature_map_lane_ids_gin
    ON atlas_feature_map USING gin (lane_ids);

COMMENT ON TABLE atlas_feature_map IS
    'Canonical source_ref → feature lineage. One truth, many projections. '
    'Joins Qdrant vectors, Neo4j nodes, NES cards, and SOM topology into a '
    'single keyed record per source file/chunk.';
