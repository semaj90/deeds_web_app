-- atlas_feature_map: canonical source_ref → feature lineage table
-- One row per source_ref. Joins Qdrant, Neo4j, NES, and SOM into one truth.
-- Applied manually: psql $DATABASE_URL -f drizzle/manual/atlas_feature_map.sql

CREATE TABLE IF NOT EXISTS atlas_feature_map (
    source_ref            TEXT         PRIMARY KEY,
    feature_id            TEXT,
    feature_label         TEXT,
    canonical_name        TEXT,
    related_feature_ids   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    cluster_id            TEXT,
    centroid_id           TEXT,
    som_cluster           TEXT,
    community_id          INTEGER,
    som_bmu_row           INTEGER,
    som_bmu_col           INTEGER,
    tree_node_id          UUID REFERENCES atlas_tree_nodes(node_id) ON DELETE SET NULL,
    qdrant_point_id       TEXT,
    qdrant_point_ids      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    neo4j_node_id         TEXT,
    neo4j_node_ids        JSONB        NOT NULL DEFAULT '[]'::jsonb,
    nes_card_id           TEXT,
    packet_keys           JSONB        NOT NULL DEFAULT '[]'::jsonb,
    lane_ids              TEXT[]       NOT NULL DEFAULT '{}',
    file_path             TEXT,
    source_refs           JSONB        NOT NULL DEFAULT '[]'::jsonb,
    metadata              JSONB        NOT NULL DEFAULT '{}'::jsonb,
    summary               TEXT,
    pagerank              TEXT,
    centrality            TEXT,
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atlas_version         INTEGER      NOT NULL DEFAULT 1,
    indexed_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_feature_map_feature_id_idx
    ON atlas_feature_map (feature_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_feature_id
    ON atlas_feature_map (feature_id);

CREATE INDEX IF NOT EXISTS afm_community_id_idx
    ON atlas_feature_map (community_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_source_ref
    ON atlas_feature_map (source_ref);

CREATE INDEX IF NOT EXISTS atlas_feature_map_som_cluster_idx
    ON atlas_feature_map (som_cluster);

CREATE INDEX IF NOT EXISTS atlas_feature_map_cluster_id_idx
    ON atlas_feature_map (cluster_id);

CREATE INDEX IF NOT EXISTS atlas_feature_map_tree_node_id_idx
    ON atlas_feature_map (tree_node_id);

CREATE INDEX IF NOT EXISTS atlas_feature_map_related_gin
    ON atlas_feature_map USING gin (related_feature_ids);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_metadata_gin
    ON atlas_feature_map USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_qdrant_point_ids_gin
    ON atlas_feature_map USING gin (qdrant_point_ids);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_neo4j_node_ids_gin
    ON atlas_feature_map USING gin (neo4j_node_ids);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_packet_keys_gin
    ON atlas_feature_map USING gin (packet_keys);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_source_refs_gin
    ON atlas_feature_map USING gin (source_refs);

CREATE INDEX IF NOT EXISTS afm_pagerank_idx
    ON atlas_feature_map (pagerank);

CREATE INDEX IF NOT EXISTS atlas_feature_map_lane_ids_gin
    ON atlas_feature_map USING gin (lane_ids);

COMMENT ON TABLE atlas_feature_map IS
    'Canonical source_ref → feature lineage. One truth, many projections. '
    'Joins Qdrant vectors, Neo4j nodes, NES cards, and SOM topology into a '
    'single keyed record per source file/chunk.';
