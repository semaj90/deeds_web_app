-- GRAPHIFY-DAILY-COORDINATOR-01, section C: additive execution ledger.
-- Manual migration. NOT auto-applied by drizzle-kit — apply explicitly after review.
--
-- SAFETY CONTRACT:
--   * additive CREATE TABLE / CREATE INDEX only;
--   * no DROP / ALTER / DELETE / UPDATE / backfill of existing graphify_runs or graphify_files;
--   * does not repair the stale run 14643371-f6f2-4131-906b-235a5c06619a — that is a separate,
--     explicitly deferred decision (READINESS_ONLY_REPLAY_OR_EXPLICIT_ABANDONMENT_REVIEW per
--     docs/reports/graphify-stale-run-reconciliation-v1.json), not part of this migration.
--
-- ROOT CAUSE THIS ADDRESSES (audited live, not assumed):
--   graphify_runs_workspace_revision_parser_uq_v2 UNIQUE (workspace_id, workspace_revision,
--   parser_contract_version) WHERE workspace_revision IS NOT NULL collapses WORKSPACE SNAPSHOT
--   IDENTITY (workspaceRevision = sha256 of the sorted exact-byte source manifest — same value
--   for unchanged source bytes, by design) and EXECUTION IDENTITY (one Graphify invocation,
--   always a fresh attempt) onto the same uniqueness boundary. A writer respecting that index can
--   only ever have one graphify_runs row per (workspace, revision, parser) — a second execution
--   over byte-identical source either collides or must reuse the first execution's run_id, which
--   is exactly the class of bug that produced the stale run above (a RUNNING row with no
--   completion receipt and no live process holding it).
--
-- FROZEN IDENTITY MODEL (do not violate in future writers):
--   workspaceRevision  = content identity of the exact source-byte manifest (sha256:<hash>).
--                         Reused whenever source bytes are unchanged. NEVER includes a timestamp,
--                         run_id, hostname, OS, or sandbox kind.
--   executionId         = identity of ONE Graphify attempt. ALWAYS a fresh UUID, even when the
--                         resolved workspaceRevision is identical to a prior execution's.
--   graphRevision        = identity of the DERIVED graph output (a function of workspaceRevision +
--                         parserContractVersion + extractionContractVersion +
--                         graphAlgorithmRevision). Parser/extractor/algorithm changes move this,
--                         never workspaceRevision.
--   environmentRevision = execution provenance only (OS, sandbox kind, node/tree-sitter/producer
--                         revisions). Never part of workspaceRevision or graphRevision unless a
--                         specific environment axis is proven to change parse output, in which
--                         case ONLY that proven-relevant axis is folded into graphRevision — never
--                         hostname/user/temp-path.
--
-- This migration does NOT drop or reinterpret graphify_runs — it stays the existing
-- snapshot/inventory compatibility owner. graphify_executions is the new true execution-history
-- owner. Whether graphify_runs itself should later become the execution table is an explicit,
-- separate, reviewed decision — not made by this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.graphify_executions (
  execution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  workspace_revision text NOT NULL,

  -- Optional linkage to the existing graphify_runs snapshot/inventory row this execution is
  -- associated with, for the transition period. Nullable: a pure execution-ledger consumer need
  -- not depend on graphify_runs at all.
  legacy_graphify_run_id uuid REFERENCES public.graphify_runs(run_id) ON DELETE RESTRICT,

  parser_contract_version text NOT NULL,
  extraction_contract_version text NOT NULL,
  graph_algorithm_revision text,

  status text NOT NULL DEFAULT 'RUNNING',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  trigger_kind text NOT NULL,
  scheduler_revision text,
  environment_revision text,

  error_code text,
  error_receipt jsonb,

  -- Explicit reuse-of-derivation signaling (section 9 of the design): an execution that
  -- determined an existing complete graph artifact already satisfies this
  -- (workspaceRevision, parserContractVersion, extractionContractVersion,
  -- graphAlgorithmRevision) tuple may record which graphRevision it reused, WITHOUT reusing the
  -- execution_id of the run that originally produced it.
  reused_graph_revision text,

  canonical_authority boolean NOT NULL DEFAULT false,

  CHECK (workspace_revision ~ '^sha256:[a-f0-9]{64}$'),
  CHECK (status IN ('RUNNING', 'COMPLETED', 'COMPLETED_REUSED', 'FAILED', 'ABANDONED')),
  CHECK ((status = 'RUNNING' AND completed_at IS NULL) OR
         (status <> 'RUNNING' AND completed_at IS NOT NULL)),
  CHECK ((status = 'COMPLETED_REUSED' AND reused_graph_revision IS NOT NULL) OR
         (status <> 'COMPLETED_REUSED' AND reused_graph_revision IS NULL))
);

-- Deliberately NO unique constraint on (workspace_id, workspace_revision, parser_contract_version)
-- here — that is exactly the constraint being separated out of. Many executions MAY legitimately
-- share the same (workspace_revision, parser_contract_version) tuple.
CREATE INDEX IF NOT EXISTS graphify_executions_workspace_revision_idx_v1
  ON public.graphify_executions (workspace_id, workspace_revision);
CREATE INDEX IF NOT EXISTS graphify_executions_status_started_at_idx_v1
  ON public.graphify_executions (status, started_at DESC);
CREATE INDEX IF NOT EXISTS graphify_executions_legacy_graphify_run_id_idx_v1
  ON public.graphify_executions (legacy_graphify_run_id)
  WHERE legacy_graphify_run_id IS NOT NULL;
-- Fast lookup for stale-run reconciliation: RUNNING executions whose heartbeat has gone quiet.
CREATE INDEX IF NOT EXISTS graphify_executions_running_heartbeat_idx_v1
  ON public.graphify_executions (last_heartbeat_at)
  WHERE status = 'RUNNING';

CREATE TABLE IF NOT EXISTS public.graphify_execution_files (
  execution_id uuid NOT NULL REFERENCES public.graphify_executions(execution_id) ON DELETE RESTRICT,
  legacy_file_id uuid NULL,

  workspace_revision text NOT NULL,
  source_ref text NOT NULL,
  code_source_revision text NOT NULL,
  content_hash text NOT NULL,
  byte_length bigint NOT NULL,

  observed_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (execution_id, source_ref),

  CHECK (workspace_revision ~ '^sha256:[a-f0-9]{64}$'),
  CHECK (code_source_revision ~ '^sha256:[a-f0-9]{64}$'),
  CHECK (content_hash ~ '^(sha256:)?[a-f0-9]{64}$'),
  CHECK (byte_length >= 0)
);

-- Append-only, database-enforced (see graphify_execution_files_reject_update/_delete triggers
-- below — UPDATE/DELETE both raise) — this is what makes "which execution observed this exact
-- sourceRef@sourceRevision under this exact workspaceRevision" answerable without depending on
-- graphify_files.last_seen_run_id, which is mutable current-state information, not historical
-- proof.
CREATE INDEX IF NOT EXISTS graphify_execution_files_source_ref_idx_v1
  ON public.graphify_execution_files (workspace_revision, source_ref);
CREATE INDEX IF NOT EXISTS graphify_execution_files_code_source_revision_idx_v1
  ON public.graphify_execution_files (code_source_revision);

CREATE TABLE IF NOT EXISTS public.graphify_execution_stages (
  execution_id uuid NOT NULL REFERENCES public.graphify_executions(execution_id) ON DELETE RESTRICT,
  stage text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  input_checksum text NULL,
  output_checksum text NULL,
  receipt_ref text NULL,
  error_code text NULL,
  PRIMARY KEY (execution_id, stage),
  CHECK (stage IN ('OPEN', 'SOURCE_SELECTION', 'INVENTORY', 'AST_PARSE', 'STRUCTURAL_EXTRACT',
                   'SEMANTIC_ENRICH', 'GRAPH_BUILD', 'PROJECT', 'VALIDATE', 'CLOSE')),
  CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED')),
  CHECK ((status IN ('PENDING', 'RUNNING') AND completed_at IS NULL) OR
         (status IN ('COMPLETED', 'SKIPPED', 'FAILED') AND completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS graphify_execution_files_workspace_idx_v1
  ON public.graphify_execution_files (workspace_revision, execution_id);

-- GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02 review finding: "append-only in practice" (comment above)
-- was not database-enforced — nothing rejected an UPDATE or DELETE against this table. This
-- trigger closes that gap. It is additive (CREATE FUNCTION / CREATE TRIGGER only, no ALTER on
-- existing objects) and scoped to graphify_execution_files ONLY — graphify_execution_stages is
-- intentionally NOT covered, since its status/timestamp columns are meant to transition in place
-- (PENDING -> RUNNING -> COMPLETED/SKIPPED/FAILED) as a normal part of the coordinator's own
-- lifecycle, unlike the append-only observation-evidence table below.
CREATE OR REPLACE FUNCTION public.graphify_execution_files_reject_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'graphify_execution_files is append-only evidence: % is not permitted (execution_id=%, source_ref=%)',
    TG_OP,
    COALESCE(OLD.execution_id, NEW.execution_id),
    COALESCE(OLD.source_ref, NEW.source_ref);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS graphify_execution_files_reject_update ON public.graphify_execution_files;
CREATE TRIGGER graphify_execution_files_reject_update
  BEFORE UPDATE ON public.graphify_execution_files
  FOR EACH ROW EXECUTE FUNCTION public.graphify_execution_files_reject_mutation();

DROP TRIGGER IF EXISTS graphify_execution_files_reject_delete ON public.graphify_execution_files;
CREATE TRIGGER graphify_execution_files_reject_delete
  BEFORE DELETE ON public.graphify_execution_files
  FOR EACH ROW EXECUTE FUNCTION public.graphify_execution_files_reject_mutation();

COMMENT ON TABLE public.graphify_executions IS
  'True per-attempt execution history. One row per Graphify invocation — ALWAYS a fresh execution_id, even when workspace_revision is unchanged from a prior execution. Distinct from graphify_runs, which graphify_runs_workspace_revision_parser_uq_v2 constrains to one row per (workspace_id, workspace_revision, parser_contract_version) and therefore cannot represent repeat executions over unchanged source bytes.';
COMMENT ON COLUMN public.graphify_executions.workspace_revision IS
  'Content identity of the exact-byte source manifest (sha256:<hash>). Same value expected across multiple executions when source bytes are unchanged — this is NOT a bug, it is the frozen identity model working correctly.';
COMMENT ON COLUMN public.graphify_executions.reused_graph_revision IS
  'Set when this execution determined an existing COMPLETED/COMPLETED_REUSED graph artifact already satisfies its derivation tuple and reused it rather than recomputing — the execution_id itself is still fresh, only the derived graph output was reused.';
COMMENT ON TABLE public.graphify_execution_files IS
  'Immutable, append-only run-to-file observation membership (enforced by graphify_execution_files_reject_update/_delete BEFORE triggers — this is a database guarantee, not a convention). Proves historical execution/file binding independent of graphify_files.last_seen_run_id, which is mutable current-state pointer information, not a historical audit trail.';

COMMIT;

-- Post-apply gate order (non-production proof DB first, per this repo's established pattern):
--   1. Apply this migration in a non-production/proof database.
--   2. Write ONE bounded canary execution (3-10 known sources) through
--      graphify_executions + graphify_execution_files without touching graphify_runs' unique
--      constraint or reusing an existing run_id.
--   3. Run a SECOND execution against the byte-identical source set and confirm:
--        executionId_A != executionId_B
--        workspaceRevision_A == workspaceRevision_B
--      This is the specific proof that separation actually works — not merely that the tables
--      exist.
--   4. Only after that proof, decide whether a production coordinator (advisory-lock owner,
--      stage ledger, heartbeat/abandonment reconciliation) writes through this ledger. That
--      coordinator is a separate, larger implementation (GRAPHIFY-DAILY-COORDINATOR-01 sections
--      B, D-K) intentionally NOT built by this migration.
--   5. Do not retry PKT-LINEAGE-08 until step 3's proof passes.
