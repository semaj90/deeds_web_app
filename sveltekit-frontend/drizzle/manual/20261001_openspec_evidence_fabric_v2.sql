-- OpenSpec evidence fabric v2.
-- Design-only additive companion to 20261001_openspec_evidence_fabric_v1.sql.
-- Do not apply until PostgreSQL 18 schema-owner review, dry-run validation,
-- and explicit operator authorization. No rows are seeded.

CREATE TABLE IF NOT EXISTS public.openspec_task_predicate (
  predicate_id text PRIMARY KEY,
  change_id text NOT NULL,
  task_id text NOT NULL,
  predicate_ordinal integer NOT NULL CHECK (predicate_ordinal >= 0),
  predicate_kind text NOT NULL,
  predicate_text text NOT NULL,
  source_ref text NOT NULL,
  workspace_revision text NOT NULL,
  source_revision text NOT NULL,
  checksum text NOT NULL UNIQUE,
  FOREIGN KEY (change_id, task_id) REFERENCES public.openspec_tasks(change_id, task_id),
  UNIQUE (change_id, task_id, predicate_ordinal)
);

CREATE TABLE IF NOT EXISTS public.evidence_assertion (
  evidence_id text NOT NULL REFERENCES public.evidence_receipts(evidence_id),
  assertion_id text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  passed boolean NOT NULL,
  checksum text NOT NULL,
  PRIMARY KEY (evidence_id, assertion_id),
  UNIQUE (evidence_id, checksum)
);

-- The v1 physical task_evidence table remains the single binding owner.
-- This view supplies the explicit EVF-06 name without creating a second
-- mutable authority or requiring a destructive rename of an applied table.
CREATE OR REPLACE VIEW public.task_evidence_binding AS
SELECT
  change_id,
  task_id,
  evidence_id,
  predicate AS predicate_id,
  relation
FROM public.task_evidence;

CREATE TABLE IF NOT EXISTS public.openspec_supersession (
  supersession_id text PRIMARY KEY,
  prior_change_id text NOT NULL REFERENCES public.openspec_changes(change_id),
  successor_change_id text NOT NULL REFERENCES public.openspec_changes(change_id),
  source_ref text NOT NULL,
  declaration text NOT NULL,
  workspace_revision text NOT NULL,
  checksum text NOT NULL UNIQUE,
  CHECK (prior_change_id <> successor_change_id)
);

CREATE INDEX IF NOT EXISTS openspec_task_predicate_task_idx
  ON public.openspec_task_predicate (change_id, task_id, workspace_revision);
CREATE INDEX IF NOT EXISTS openspec_task_predicate_text_fts_idx
  ON public.openspec_task_predicate USING gin (to_tsvector('simple', predicate_text));
CREATE INDEX IF NOT EXISTS evidence_assertion_passed_idx
  ON public.evidence_assertion (evidence_id, passed);
CREATE INDEX IF NOT EXISTS openspec_supersession_successor_idx
  ON public.openspec_supersession (successor_change_id, workspace_revision);

CREATE OR REPLACE VIEW public.openspec_task_current_v2 AS
SELECT
  task.change_id,
  task.task_id,
  task.task_ref,
  task.declared_checked,
  task.workspace_revision,
  COALESCE(current_proof.proven_count, 0)::integer AS current_revision_proof_count,
  COALESCE(current_proof.partial_count, 0)::integer AS current_revision_partial_count,
  COALESCE(current_proof.blocked_count, 0)::integer AS current_revision_blocked_count,
  COALESCE(current_proof.failed_count, 0)::integer AS current_revision_failed_count,
  COALESCE(stale_proof.stale_count, 0)::integer AS stale_proof_count,
  CASE
    WHEN COALESCE(current_proof.failed_count, 0) > 0 THEN 'FAILED'
    WHEN COALESCE(current_proof.blocked_count, 0) > 0 THEN 'BLOCKED'
    WHEN COALESCE(current_proof.proven_count, 0) > 0 THEN 'PROVEN'
    WHEN COALESCE(current_proof.partial_count, 0) > 0 THEN 'PARTIAL'
    WHEN COALESCE(stale_proof.stale_count, 0) > 0 THEN 'STALE'
    ELSE 'CLAIM_ONLY'
  END AS proof_state
FROM public.openspec_tasks AS task
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE receipt.verdict = 'PROVEN' AND receiptAssertions.all_passed AND (receipt.readback->>'required' IN ('false', '0', '') OR receipt.readback->>'performed' = 'true')) AS proven_count,
    count(*) FILTER (WHERE receipt.verdict = 'PARTIAL') AS partial_count,
    count(*) FILTER (WHERE receipt.verdict = 'BLOCKED') AS blocked_count,
    count(*) FILTER (WHERE receipt.verdict = 'FAILED') AS failed_count
  FROM public.task_evidence_binding AS link
  JOIN public.evidence_receipts AS receipt ON receipt.evidence_id = link.evidence_id
  LEFT JOIN LATERAL (
    SELECT count(*) > 0 AND count(*) = count(*) FILTER (WHERE assertion.passed) AS all_passed
    FROM public.evidence_assertion AS assertion
    WHERE assertion.evidence_id = receipt.evidence_id
  ) AS receiptAssertions ON true
  WHERE link.change_id = task.change_id
    AND link.task_id = task.task_id
    AND receipt.workspace_revision = task.workspace_revision
) AS current_proof ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS stale_count
  FROM public.task_evidence_binding AS link
  JOIN public.evidence_receipts AS receipt ON receipt.evidence_id = link.evidence_id
  WHERE link.change_id = task.change_id
    AND link.task_id = task.task_id
    AND receipt.workspace_revision <> task.workspace_revision
) AS stale_proof ON true;
