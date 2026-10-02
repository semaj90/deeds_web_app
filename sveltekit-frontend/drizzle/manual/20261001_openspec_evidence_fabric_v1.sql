-- OpenSpec evidence fabric v1.
-- Design-only sidecar: do not apply until schema-owner review, dry-run validation,
-- and explicit operator authorization. No task, receipt, or projection rows are seeded.

CREATE TABLE IF NOT EXISTS public.openspec_changes (
  change_id text PRIMARY KEY,
  path text NOT NULL UNIQUE,
  proposal_hash text,
  design_hash text,
  tasks_hash text NOT NULL,
  workspace_revision text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'SUPERSEDED')),
  inventory jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.openspec_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canonical_task_key text NOT NULL UNIQUE,
  authority_scope text NOT NULL,
  declared_task_id text,
  identity_kind text NOT NULL CHECK (identity_kind IN ('DECLARED_TASK_ID', 'MIGRATION_KEY', 'GATE_ID', 'REQUIREMENT_ID', 'STABLE_ANCHOR', 'DERIVED')),
  lifecycle_state text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_state IN ('ACTIVE', 'FINALIZED', 'SUPERSEDED', 'ARCHIVED')),
  current_revision bigint NOT NULL DEFAULT 1 CHECK (current_revision >= 1),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  archived_at timestamptz,
  change_id text NOT NULL REFERENCES public.openspec_changes(change_id),
  task_id text NOT NULL,
  task_ref text NOT NULL UNIQUE,
  task_text text NOT NULL,
  task_hash text NOT NULL,
  declared_checked boolean NOT NULL,
  task_id_status text NOT NULL CHECK (task_id_status IN ('STABLE', 'TASK_ID_MISSING', 'DUPLICATE')),
  workspace_revision text NOT NULL,
  owner_change_id text,
  UNIQUE (change_id, task_id)
);

CREATE TABLE IF NOT EXISTS public.openspec_dependencies (
  from_change_id text NOT NULL,
  from_task_id text NOT NULL,
  to_change_id text NOT NULL,
  to_task_id text,
  edge_type text NOT NULL,
  source_ref text,
  PRIMARY KEY (from_change_id, from_task_id, to_change_id, to_task_id, edge_type),
  FOREIGN KEY (from_change_id, from_task_id) REFERENCES public.openspec_tasks(change_id, task_id)
);

CREATE TABLE IF NOT EXISTS public.evidence_receipts (
  evidence_id text PRIMARY KEY,
  schema_version text NOT NULL,
  evidence_type text NOT NULL,
  change_id text NOT NULL,
  task_id text NOT NULL,
  claim text NOT NULL,
  git_commit text,
  workspace_revision text NOT NULL,
  source_revision text,
  graph_revision text,
  representation_revision text,
  producer text NOT NULL,
  command text,
  inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  observed_at timestamptz NOT NULL,
  exit_code integer,
  assertions jsonb NOT NULL DEFAULT '[]'::jsonb,
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  checksum text NOT NULL UNIQUE,
  verifier text,
  readback jsonb NOT NULL DEFAULT '{}'::jsonb,
  verdict text NOT NULL CHECK (verdict IN ('PROVEN', 'PARTIAL', 'BLOCKED', 'FAILED', 'STALE'))
);

CREATE TABLE IF NOT EXISTS public.task_evidence (
  change_id text NOT NULL,
  task_id text NOT NULL,
  evidence_id text NOT NULL REFERENCES public.evidence_receipts(evidence_id),
  predicate text NOT NULL,
  relation text NOT NULL,
  PRIMARY KEY (change_id, task_id, evidence_id, predicate),
  FOREIGN KEY (change_id, task_id) REFERENCES public.openspec_tasks(change_id, task_id)
);

CREATE TABLE IF NOT EXISTS public.openspec_evidence_chunks (
  chunk_id text PRIMARY KEY,
  canonical_id text NOT NULL,
  change_id text NOT NULL,
  task_id text NOT NULL,
  evidence_id text REFERENCES public.evidence_receipts(evidence_id),
  content text NOT NULL,
  embedding vector(768),
  workspace_revision text NOT NULL,
  source_revision text,
  representation_revision text NOT NULL DEFAULT 'semantic_768',
  checksum text NOT NULL UNIQUE,
  FOREIGN KEY (change_id, task_id) REFERENCES public.openspec_tasks(change_id, task_id)
);

CREATE INDEX IF NOT EXISTS openspec_tasks_workspace_revision_idx
  ON public.openspec_tasks (workspace_revision, change_id, declared_checked);
CREATE INDEX IF NOT EXISTS evidence_receipts_task_revision_idx
  ON public.evidence_receipts (change_id, task_id, workspace_revision, verdict);
CREATE INDEX IF NOT EXISTS evidence_receipts_claim_fts_idx
  ON public.evidence_receipts USING gin (to_tsvector('simple', claim));
CREATE INDEX IF NOT EXISTS openspec_evidence_chunks_embedding_hnsw_idx
  ON public.openspec_evidence_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE OR REPLACE VIEW public.openspec_task_current AS
SELECT
  task.change_id,
  task.task_id,
  task.task_ref,
  task.declared_checked,
  task.workspace_revision,
  COALESCE(current_proof.proof_count, 0)::integer AS current_revision_proof_count,
  COALESCE(stale_proof.stale_count, 0)::integer AS stale_proof_count,
  COALESCE(current_proof.blocked_count, 0)::integer AS blocked_count,
  CASE
    WHEN COALESCE(current_proof.failed_count, 0) > 0 THEN 'FAILED'
    WHEN COALESCE(current_proof.blocked_count, 0) > 0 THEN 'BLOCKED'
    WHEN COALESCE(current_proof.proof_count, 0) > 0 THEN 'PROVEN'
    WHEN COALESCE(current_proof.partial_count, 0) > 0 THEN 'PARTIAL'
    WHEN COALESCE(stale_proof.stale_count, 0) > 0 THEN 'STALE'
    ELSE 'CLAIM_ONLY'
  END AS proof_state
FROM public.openspec_tasks AS task
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE receipt.verdict = 'PROVEN') AS proof_count,
    count(*) FILTER (WHERE receipt.verdict = 'PARTIAL') AS partial_count,
    count(*) FILTER (WHERE receipt.verdict = 'BLOCKED') AS blocked_count,
    count(*) FILTER (WHERE receipt.verdict = 'FAILED') AS failed_count
  FROM public.task_evidence AS link
  JOIN public.evidence_receipts AS receipt ON receipt.evidence_id = link.evidence_id
  WHERE link.change_id = task.change_id
    AND link.task_id = task.task_id
    AND receipt.workspace_revision = task.workspace_revision
) AS current_proof ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS stale_count
  FROM public.task_evidence AS link
  JOIN public.evidence_receipts AS receipt ON receipt.evidence_id = link.evidence_id
  WHERE link.change_id = task.change_id
    AND link.task_id = task.task_id
    AND receipt.workspace_revision <> task.workspace_revision
) AS stale_proof ON true;
