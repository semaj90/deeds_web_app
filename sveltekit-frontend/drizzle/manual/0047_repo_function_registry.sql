-- Canonical repo function registry: function/tool lookup spine for OpenCode + startup briefing
-- Additive only. Backfill from docs/reports/repo-function-registry.json.

CREATE TABLE IF NOT EXISTS repo_function_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ref text NOT NULL UNIQUE,
  file_path text,
  symbol text NOT NULL,
  kind text NOT NULL,
  feature_id text NOT NULL,
  feature_label text NOT NULL,
  runtime_lane text,
  workflow_lane text[] NOT NULL DEFAULT '{}'::text[],
  permission_lane text,
  keywords text[] NOT NULL DEFAULT '{}'::text[],
  summary text,
  copy_merge_use text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE repo_function_registry
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE repo_function_registry
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

ALTER TABLE repo_function_registry
  ALTER COLUMN metadata SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS repo_function_registry_source_ref_unique
  ON repo_function_registry (source_ref);

CREATE UNIQUE INDEX IF NOT EXISTS repo_function_registry_feature_id_unique
  ON repo_function_registry (feature_id);

CREATE INDEX IF NOT EXISTS idx_repo_function_registry_source_ref
  ON repo_function_registry (source_ref);

CREATE INDEX IF NOT EXISTS idx_repo_function_registry_feature_id
  ON repo_function_registry (feature_id);

CREATE INDEX IF NOT EXISTS idx_repo_function_registry_kind
  ON repo_function_registry (kind);

CREATE INDEX IF NOT EXISTS idx_repo_function_registry_runtime_lane
  ON repo_function_registry (runtime_lane);

CREATE INDEX IF NOT EXISTS idx_repo_function_registry_permission_lane
  ON repo_function_registry (permission_lane);

CREATE INDEX IF NOT EXISTS idx_repo_function_registry_workflow_lane_gin
  ON repo_function_registry USING gin (workflow_lane);

CREATE INDEX IF NOT EXISTS idx_repo_function_registry_keywords_gin
  ON repo_function_registry USING gin (keywords);

CREATE INDEX IF NOT EXISTS idx_repo_function_registry_metadata_gin
  ON repo_function_registry USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_repo_function_registry_updated_at
  ON repo_function_registry (updated_at DESC);
