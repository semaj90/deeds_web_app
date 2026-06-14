-- Split atlas_packets into two canonical ledgers:
-- 1. atlas_codebase_packets: real file-based identity (3,251 rows)
-- 2. atlas_feature_packets: concept/feature-based identity (14,234 rows)

-- Create atlas_codebase_packets (file-based packets only)
CREATE TABLE IF NOT EXISTS atlas_codebase_packets (
  packet_key VARCHAR(255) PRIMARY KEY NOT NULL,
  source_ref VARCHAR(512) NOT NULL,
  file_path VARCHAR(512),
  feature_id VARCHAR(255),
  feature_label VARCHAR(255),
  community_id INTEGER,
  community_source VARCHAR(100),
  community_confidence NUMERIC(3,2),
  metadata JSONB DEFAULT '{}'::jsonb,
  lineage_version VARCHAR(50) DEFAULT 'packet-identity-v2',
  ledger_type VARCHAR(50) DEFAULT 'codebase',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_atlas_codebase_packets_source_ref ON atlas_codebase_packets(source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_packets_feature_id ON atlas_codebase_packets(feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_packets_community_id ON atlas_codebase_packets(community_id);
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_packets_lineage_version ON atlas_codebase_packets(lineage_version);
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_packets_metadata_gin ON atlas_codebase_packets USING GIN(metadata);

-- Create atlas_feature_packets (concept/feature/dependency packets)
CREATE TABLE IF NOT EXISTS atlas_feature_packets (
  packet_key VARCHAR(255) PRIMARY KEY NOT NULL,
  source_ref VARCHAR(512) NOT NULL,
  feature_id VARCHAR(255),
  feature_label VARCHAR(255),
  packet_type VARCHAR(100),
  community_id INTEGER,
  community_source VARCHAR(100),
  community_confidence NUMERIC(3,2),
  metadata JSONB DEFAULT '{}'::jsonb,
  lineage_version VARCHAR(50) DEFAULT 'packet-identity-v2',
  ledger_type VARCHAR(50) DEFAULT 'feature',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_packets_source_ref ON atlas_feature_packets(source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_packets_feature_id ON atlas_feature_packets(feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_packets_packet_type ON atlas_feature_packets(packet_type);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_packets_lineage_version ON atlas_feature_packets(lineage_version);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_packets_metadata_gin ON atlas_feature_packets USING GIN(metadata);

-- Rename old mixed table for safe archival
ALTER TABLE IF EXISTS atlas_packets RENAME TO atlas_packets_legacy;
