-- Live analysis_pass_results contract aligned to the durable pass ledger.
-- This file mirrors the current database shape, which is the canonical
-- compatibility contract used by the shared pass ledger helper.

CREATE TABLE IF NOT EXISTS analysis_pass_results (
  id bigserial PRIMARY KEY,
  pass_key text NOT NULL,
  -- Logical pass identity (packetKey+sourceRevision+passName+passRevision+
  -- inputHash), deliberately excludes analysisJobId/evidenceId unlike
  -- pass_key. See PF4C in openspec/changes/parent-atlas-pass-fabric/tasks.md.
  pass_identity_hash text,
  packet_key text NOT NULL,
  source_ref text,
  feature_id text,
  pass_type text NOT NULL,
  status text NOT NULL,
  input_hash text,
  prompt_hash text,
  model_name text,
  temperature real,
  max_tokens integer,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  index_push jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_revision text,
  pass_revision text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analysis_pass_results_pass_key_idx
  ON analysis_pass_results (pass_key);

CREATE INDEX IF NOT EXISTS analysis_pass_results_pass_identity_hash_idx
  ON analysis_pass_results (pass_identity_hash);

CREATE INDEX IF NOT EXISTS analysis_pass_results_packet_idx
  ON analysis_pass_results (packet_key);

CREATE INDEX IF NOT EXISTS analysis_pass_results_source_idx
  ON analysis_pass_results (source_ref, source_revision);

CREATE INDEX IF NOT EXISTS analysis_pass_results_pass_type_idx
  ON analysis_pass_results (pass_type);

CREATE INDEX IF NOT EXISTS analysis_pass_results_status_idx
  ON analysis_pass_results (status);

CREATE INDEX IF NOT EXISTS analysis_pass_results_created_idx
  ON analysis_pass_results (created_at);
