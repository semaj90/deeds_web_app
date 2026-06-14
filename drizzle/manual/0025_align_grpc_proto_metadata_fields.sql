/**
 * 0025_align_grpc_proto_metadata_fields.sql
 *
 * Adds missing metadata JSONB + feature_id columns to support
 * gRPC proto serialization + Postgres index alignment.
 */

-- task_semantic_packets: add metadata JSONB
ALTER TABLE IF EXISTS task_semantic_packets
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_metadata_gin
  ON task_semantic_packets USING GIN(metadata);

-- concept_records: add feature_id + metadata
ALTER TABLE IF EXISTS concept_records
  ADD COLUMN IF NOT EXISTS feature_id TEXT;

ALTER TABLE IF EXISTS concept_records
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_concept_records_feature_id
  ON concept_records(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_concept_records_metadata_gin
  ON concept_records USING GIN(metadata);

-- route_runtime_packets: ensure raw JSONB GIN index
CREATE INDEX IF NOT EXISTS idx_rrp_raw_gin
  ON route_runtime_packets USING GIN(raw);
