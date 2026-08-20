-- Parent Atlas algorithm execution identity ledger.
--
-- This table answers "which algorithm/backend/geometry actually ran?" without
-- granting execution metadata canonical application authority. PostgreSQL owns
-- the durable receipt; Kafka/Valkey may project/cache it downstream.

CREATE TABLE IF NOT EXISTS atlas_algorithm_execution_receipts (
  execution_id text PRIMARY KEY,
  workflow_id text,
  action_id text,
  dag_node_id text NOT NULL,
  stage text NOT NULL,
  logical_lane text NOT NULL,
  algorithm_class text NOT NULL,
  algorithm text NOT NULL,
  geometry text NOT NULL,
  metric text NOT NULL,
  compute_backend text NOT NULL,
  compilation_mode text NOT NULL,
  transport text NOT NULL,
  serialization text NOT NULL,
  source_snapshot_revision text NOT NULL,
  representation_revision text,
  graph_snapshot_revision text,
  relationship_snapshot_revision text,
  input_checksum text NOT NULL CHECK (input_checksum ~ '^[a-f0-9]{64}$'),
  output_checksum text CHECK (output_checksum IS NULL OR output_checksum ~ '^[a-f0-9]{64}$'),
  manifest_checksum text NOT NULL CHECK (manifest_checksum ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_algorithm_execution_receipts_workflow_idx
  ON atlas_algorithm_execution_receipts (workflow_id, action_id, recorded_at DESC)
  WHERE workflow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_algorithm_execution_receipts_snapshot_idx
  ON atlas_algorithm_execution_receipts (source_snapshot_revision, representation_revision, algorithm, compute_backend);

CREATE INDEX IF NOT EXISTS atlas_algorithm_execution_receipts_dag_idx
  ON atlas_algorithm_execution_receipts (dag_node_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS atlas_algorithm_execution_receipts_manifest_gin
  ON atlas_algorithm_execution_receipts USING gin (manifest jsonb_path_ops);

COMMENT ON TABLE atlas_algorithm_execution_receipts IS
  'Append-only Parent Atlas execution receipts. Records algorithm/geometry/backend/runtime identity but is not canonical feature/relationship/evidence truth.';

COMMENT ON COLUMN atlas_algorithm_execution_receipts.manifest IS
  'Validated atlas.algorithm-execution-manifest.v1 JSON. Kafka/Valkey/simdjson/gRPC are implementation dimensions, not canonical authorities.';
