-- atlas_identity_ledger.sql
-- Store parity verification table
-- Tracks which stores (Postgres, Qdrant, Neo4j, Redis) have indexed each packet

CREATE TABLE IF NOT EXISTS atlas_identity_ledger (
  packet_key text NOT NULL,
  feature_id text,
  source_ref text,
  qdrant_id bigint,
  som_cluster int,
  kmeans_cluster int,

  indexed_pg boolean DEFAULT false,
  indexed_qdrant boolean DEFAULT false,
  indexed_neo4j boolean DEFAULT false,
  indexed_redis boolean DEFAULT false,
  indexed_bitfrost boolean DEFAULT false,

  verified_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  PRIMARY KEY(packet_key)
);

CREATE INDEX IF NOT EXISTS idx_atlas_ledger_feature_id ON atlas_identity_ledger(feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_ledger_source_ref ON atlas_identity_ledger(source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_ledger_qdrant_id ON atlas_identity_ledger(qdrant_id);
CREATE INDEX IF NOT EXISTS idx_atlas_ledger_indexed_status ON atlas_identity_ledger(indexed_pg, indexed_qdrant, indexed_neo4j, indexed_redis);

-- Add comment
COMMENT ON TABLE atlas_identity_ledger IS 'Canonical packet-level store parity verification table. Tracks which stores (Postgres=truth, Qdrant/Neo4j/Redis=mirrors) have indexed each packet.';
COMMENT ON COLUMN atlas_identity_ledger.packet_key IS 'Primary key: immutable packet identifier (source_ref + feature_id + hash)';
COMMENT ON COLUMN atlas_identity_ledger.indexed_pg IS 'Packet exists in atlas_packets (Postgres canonical)';
COMMENT ON COLUMN atlas_identity_ledger.indexed_qdrant IS 'Packet exists in codebase_chunks_768 (Qdrant mirror)';
COMMENT ON COLUMN atlas_identity_ledger.indexed_neo4j IS 'Packet exists as Packet node (Neo4j mirror)';
COMMENT ON COLUMN atlas_identity_ledger.indexed_redis IS 'Packet exists as bifrost:packet:* key (Redis cache)';
