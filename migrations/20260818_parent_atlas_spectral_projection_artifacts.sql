BEGIN;

CREATE TABLE IF NOT EXISTS atlas_spectral_projection_artifacts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_revision text NOT NULL,
  source_revision text NOT NULL,
  graph_revision text NOT NULL,
  projection_revision text NOT NULL,
  representation_id text NOT NULL CHECK (representation_id IN ('pca_128', 'pca_64', 'spectral_4d', 'singular_values', 'eigenvalues')),
  rows integer NOT NULL CHECK (rows >= 0),
  cols integer NOT NULL CHECK (cols >= 0),
  dtype text NOT NULL DEFAULT 'float32-le',
  payload bytea NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  producer_revision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_revision, graph_revision, projection_revision, representation_id)
);

CREATE INDEX IF NOT EXISTS atlas_spectral_projection_artifacts_revision_idx
  ON atlas_spectral_projection_artifacts (workspace_revision, graph_revision, projection_revision);

CREATE TABLE IF NOT EXISTS atlas_dag_mutation_receipts (
  mutation_id text PRIMARY KEY,
  workflow_id text NOT NULL,
  workflow_revision bigint NOT NULL CHECK (workflow_revision >= 0),
  parent_dag_revision text NOT NULL,
  mutation_kind text NOT NULL,
  target_node_ids jsonb NOT NULL,
  reason_codes jsonb NOT NULL,
  evidence_refs jsonb NOT NULL,
  expected_quality_gain double precision NOT NULL CHECK (expected_quality_gain BETWEEN 0 AND 1),
  estimated_latency_ms double precision NOT NULL CHECK (estimated_latency_ms >= 0),
  estimated_vram_bytes bigint NOT NULL CHECK (estimated_vram_bytes >= 0),
  mutation_risk double precision NOT NULL CHECK (mutation_risk BETWEEN 0 AND 1),
  validation_state text NOT NULL DEFAULT 'PENDING' CHECK (validation_state IN ('PENDING', 'PASS', 'FAIL', 'ROLLED_BACK')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
