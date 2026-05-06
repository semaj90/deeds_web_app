-- directory_cluster_checkpoints: per-directory karpathy GPU codebase index checkpoints.
--
-- Owned by scripts/enrich-wiki-with-audit-signals.mjs (the directory enrichment pass).
-- Each row represents a directory's clustered + audited state at a point in time.
--
--   stable_key       = "dir:<path>"  (canonical PK across runs; survives renames via path-stable lookup)
--   checkpoint_hash  = sha256(files + audit)  → fast unchanged-skip on re-runs
--   cluster_label    = canonical cluster name (api-openai-facade, ai-agent-control-plane, ...)
--   tags             = text[] (api-route, ace-entry, openai-facade, gemma4, ...)
--   audit            = jsonb { G16, G4, G15, raw }
--
-- Sister table to `code_llm_index` (file-level) — this one operates at directory granularity.

CREATE TABLE IF NOT EXISTS directory_cluster_checkpoints (
  stable_key       text         PRIMARY KEY,
  directory_path   text         NOT NULL,
  checkpoint_hash  varchar(64)  NOT NULL,
  file_count       integer      NOT NULL DEFAULT 0,
  route_count      integer      NOT NULL DEFAULT 0,
  test_count       integer      NOT NULL DEFAULT 0,
  cluster_label    text,
  tags             text[]       NOT NULL DEFAULT '{}',
  audit            jsonb        NOT NULL DEFAULT '{}',
  indexed_at       timestamptz  NOT NULL DEFAULT now(),
  created_at       timestamptz  NOT NULL DEFAULT now()
);

-- Hot indexes
CREATE INDEX IF NOT EXISTS dcc_directory_path_idx  ON directory_cluster_checkpoints (directory_path);
CREATE INDEX IF NOT EXISTS dcc_cluster_label_idx   ON directory_cluster_checkpoints (cluster_label);
CREATE INDEX IF NOT EXISTS dcc_indexed_at_idx      ON directory_cluster_checkpoints (indexed_at DESC);
CREATE INDEX IF NOT EXISTS dcc_tags_gin            ON directory_cluster_checkpoints USING gin (tags);
CREATE INDEX IF NOT EXISTS dcc_audit_gin           ON directory_cluster_checkpoints USING gin (audit jsonb_path_ops);

COMMENT ON TABLE directory_cluster_checkpoints IS
  'Karpathy GPU codebase index checkpoints — per-directory clusters + audit signals. Source of truth lives in scratch/index-checkpoints/directory-clusters.json; this table is durable mirror for SQL analytics.';
