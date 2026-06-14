-- Add lineage_version column to atlas_packets
-- Default: packet-identity-v2
-- Purpose: Prevent silent schema drift across Postgres/Qdrant/Redis/Neo4j mirrors

ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS lineage_version VARCHAR(50) DEFAULT 'packet-identity-v2' NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_lineage_version
ON atlas_packets(lineage_version);

-- Similarly ensure Qdrant collection has lineage_version in payload
-- (This is a documentation reminder; Qdrant schema updates happen in upsert scripts)

-- Neo4j nodes must also carry lineage_version
-- (Document this in neo4j-schema-requirements.md)
