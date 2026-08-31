-- Parent Atlas revision-qualified semantic embedding cache.
-- Planned sidecar only: do not apply until migration-ledger review and caller cutover.
-- The legacy embedding_cache table is intentionally untouched.

CREATE TABLE IF NOT EXISTS semantic_embedding_cache_v2 (
  cache_key text PRIMARY KEY,
  representation_id varchar(64) NOT NULL CHECK (representation_id = 'semantic_768'),
  representation_revision text NOT NULL,
  model_artifact_revision text NOT NULL,
  tokenizer_revision text NOT NULL,
  input_policy_revision text NOT NULL,
  normalized_input_checksum text NOT NULL,
  embedding halfvec(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS semantic_embedding_cache_v2_input_checksum_idx
  ON semantic_embedding_cache_v2 (normalized_input_checksum);

CREATE INDEX IF NOT EXISTS semantic_embedding_cache_v2_representation_idx
  ON semantic_embedding_cache_v2 (representation_id, representation_revision);
