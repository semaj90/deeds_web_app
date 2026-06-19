-- Phase 16: topology / GDS additive migration.
-- Keep latent_64 as bytea; it is a derived latent payload, not an ANN column.

ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank double precision,
  ADD COLUMN IF NOT EXISTS betweenness double precision,
  ADD COLUMN IF NOT EXISTS eigenvector double precision,
  ADD COLUMN IF NOT EXISTS nn_1 uuid,
  ADD COLUMN IF NOT EXISTS nn_2 uuid,
  ADD COLUMN IF NOT EXISTS nn_3 uuid,
  ADD COLUMN IF NOT EXISTS nn_4 uuid,
  ADD COLUMN IF NOT EXISTS ae_distance double precision,
  ADD COLUMN IF NOT EXISTS topology_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS topology_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS relation_type text;

CREATE INDEX IF NOT EXISTS idx_atlas_topology_pagerank
ON atlas_topology_index (pagerank DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_topology_community_pagerank
ON atlas_topology_index (community_id, pagerank DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_topology_z_som
ON atlas_topology_index (z_som);

CREATE INDEX IF NOT EXISTS idx_atlas_topology_version
ON atlas_topology_index (topology_version);

CREATE INDEX IF NOT EXISTS idx_atlas_topology_nn_1 ON atlas_topology_index (nn_1);
CREATE INDEX IF NOT EXISTS idx_atlas_topology_nn_2 ON atlas_topology_index (nn_2);
CREATE INDEX IF NOT EXISTS idx_atlas_topology_nn_3 ON atlas_topology_index (nn_3);
CREATE INDEX IF NOT EXISTS idx_atlas_topology_nn_4 ON atlas_topology_index (nn_4);

CREATE INDEX IF NOT EXISTS idx_atlas_topology_relation_type
ON atlas_topology_index (relation_type);
