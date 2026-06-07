-- atlas_memory_address_registry
-- Durable address table closing the lineage chain across all storage lanes.
-- One row per source_ref / storage_lane pair; tracks where each document lives
-- in Redis, Qdrant, Postgres, Neo4j, CouchDB, ACE, NES, and Parent Atlas.

CREATE TABLE IF NOT EXISTS atlas_memory_address_registry (
  memory_id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ref_id     integer     REFERENCES parent_atlas_documents(id) ON DELETE CASCADE,
  source_ref        text        NOT NULL,
  feature_id        text,
  packet_id         text,
  cluster_id        text,
  embedding_id      text,
  parent_memory_id  uuid        REFERENCES atlas_memory_address_registry(memory_id) ON DELETE SET NULL,
  storage_lane      text        NOT NULL CHECK (storage_lane IN ('postgres','redis','qdrant','neo4j','couchdb','nes','ace','atlas')),
  retrieval_lane    text        NOT NULL CHECK (retrieval_lane IN ('ace','nes','atlas','karpathy','unknown')),
  valid_from        timestamptz NOT NULL DEFAULT now(),
  valid_to          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amr_source_ref_idx       ON atlas_memory_address_registry(source_ref);
CREATE INDEX IF NOT EXISTS amr_source_ref_id_idx    ON atlas_memory_address_registry(source_ref_id);
CREATE INDEX IF NOT EXISTS amr_feature_id_idx       ON atlas_memory_address_registry(feature_id);
CREATE INDEX IF NOT EXISTS amr_storage_lane_idx     ON atlas_memory_address_registry(storage_lane);
CREATE INDEX IF NOT EXISTS amr_cluster_id_idx       ON atlas_memory_address_registry(cluster_id);
CREATE INDEX IF NOT EXISTS amr_valid_range_idx      ON atlas_memory_address_registry(valid_from, valid_to);
CREATE UNIQUE INDEX IF NOT EXISTS amr_source_ref_lane_uniq ON atlas_memory_address_registry(source_ref, storage_lane);
