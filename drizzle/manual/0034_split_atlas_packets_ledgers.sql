-- Split atlas_packets into two canonical ledgers:
-- 1. atlas_codebase_packets — real source files (Postgres ↔ Qdrant ↔ Redis alignment)
-- 2. atlas_feature_packets — features, dependencies, synthetic concepts (separate lineage)

-- CREATE atlas_codebase_packets (new canonical identity spine for code)
CREATE TABLE IF NOT EXISTS atlas_codebase_packets (
  packet_key VARCHAR(255) PRIMARY KEY NOT NULL,
  source_ref VARCHAR(1024) NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  feature_id VARCHAR(255) NOT NULL,
  feature_label VARCHAR(512),
  community_id INTEGER,
  community_source VARCHAR(50),
  community_confidence NUMERIC(4, 3),
  metadata JSONB DEFAULT '{}',
  lineage_version VARCHAR(50) DEFAULT 'packet-identity-v2' NOT NULL,
  ledger_type VARCHAR(50) DEFAULT 'atlas:codebase' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX idx_atlas_codebase_source_ref ON atlas_codebase_packets(source_ref);
CREATE INDEX idx_atlas_codebase_feature_id ON atlas_codebase_packets(feature_id);
CREATE INDEX idx_atlas_codebase_community ON atlas_codebase_packets(community_id);
CREATE INDEX idx_atlas_codebase_lineage ON atlas_codebase_packets(lineage_version);
CREATE INDEX idx_atlas_codebase_metadata ON atlas_codebase_packets USING GIN(metadata);

-- CREATE atlas_feature_packets (separate ledger for abstractions)
CREATE TABLE IF NOT EXISTS atlas_feature_packets (
  packet_key VARCHAR(255) PRIMARY KEY NOT NULL,
  source_ref VARCHAR(1024) NOT NULL,
  feature_id VARCHAR(255) NOT NULL,
  feature_label VARCHAR(512),
  packet_type VARCHAR(50) NOT NULL,
  community_id INTEGER,
  community_source VARCHAR(50),
  community_confidence NUMERIC(4, 3),
  metadata JSONB DEFAULT '{}',
  lineage_version VARCHAR(50) DEFAULT 'packet-identity-v2' NOT NULL,
  ledger_type VARCHAR(50) DEFAULT 'atlas:feature' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX idx_atlas_feature_source_ref ON atlas_feature_packets(source_ref);
CREATE INDEX idx_atlas_feature_feature_id ON atlas_feature_packets(feature_id);
CREATE INDEX idx_atlas_feature_type ON atlas_feature_packets(packet_type);
CREATE INDEX idx_atlas_feature_lineage ON atlas_feature_packets(lineage_version);
CREATE INDEX idx_atlas_feature_metadata ON atlas_feature_packets USING GIN(metadata);

-- Rename old table for safe backfill
ALTER TABLE IF EXISTS atlas_packets RENAME TO atlas_packets_legacy;

COMMENT ON TABLE atlas_codebase_packets IS 'Canonical identity spine: real source files. Aligns with Qdrant codebase_chunks_768 and Redis gpu:karpathy:scores.';
COMMENT ON TABLE atlas_feature_packets IS 'Feature/dependency/concept abstractions. Separate from code identity. Non-codebase source_refs only.';
