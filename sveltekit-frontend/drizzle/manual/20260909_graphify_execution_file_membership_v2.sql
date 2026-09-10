-- NESTED-REPOSITORY-SOURCE-BINDING-01
-- Design-only additive migration. This creates a namespace-qualified evidence
-- relation without updating or deleting append-only graphify_execution_files rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.graphify_execution_file_membership_v2 (
  execution_id uuid NOT NULL REFERENCES public.graphify_executions(execution_id) ON DELETE RESTRICT,
  repository_id text NOT NULL,
  repository_relative_path text NOT NULL,
  source_ref text NOT NULL,
  workspace_revision text NOT NULL,
  code_source_revision text NOT NULL,
  content_hash text NOT NULL,
  byte_length bigint NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (execution_id, repository_id, repository_relative_path),
  CHECK (repository_id <> ''),
  CHECK (repository_relative_path <> ''),
  CHECK (source_ref <> ''),
  CHECK (workspace_revision ~ '^sha256:[a-f0-9]{64}$'),
  CHECK (code_source_revision ~ '^sha256:[a-f0-9]{64}$'),
  CHECK (content_hash ~ '^(sha256:)?[a-f0-9]{64}$'),
  CHECK (byte_length >= 0)
);

CREATE INDEX IF NOT EXISTS graphify_execution_file_membership_v2_workspace_idx
  ON public.graphify_execution_file_membership_v2
     (workspace_revision, repository_id, repository_relative_path);

CREATE INDEX IF NOT EXISTS graphify_execution_file_membership_v2_source_idx
  ON public.graphify_execution_file_membership_v2
     (workspace_revision, source_ref);

COMMIT;
