CREATE TABLE IF NOT EXISTS potential_recommendations (
  recommendation_id UUID PRIMARY KEY,
  run_id UUID NOT NULL,
  query_id UUID NOT NULL,
  title TEXT NOT NULL,
  candidate_payload JSONB NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  estimated_tokens INTEGER NOT NULL,
  estimated_processing_ms INTEGER NOT NULL,
  required_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'READY', 'PROMOTED', 'REJECTED', 'FAILED', 'SUPERSEDED')),
  schema_version TEXT NOT NULL,
  ontology_version TEXT NOT NULL,
  source_snapshot_sha256 CHAR(64) NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_potential_recommendations_status_next_attempt_score
  ON potential_recommendations (status, next_attempt_at, score DESC);

CREATE INDEX IF NOT EXISTS idx_potential_recommendations_query_status
  ON potential_recommendations (query_id, status);
