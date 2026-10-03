-- GRAPHIFY-EXECUTION-IDENTITY-MODEL-02A (2026-09-21, revised after operator review). SCHEMA ONLY. APPLIED 2026-09-21 (operator 'apply' in reply to 'apply 02A'; single transaction, readback verified; see the lineage ledger entry GRAPHIFY-EXECUTION-IDENTITY-MODEL-02A APPLIED).
-- Requires explicit operator sign-off (Drizzle Safety Rule) before anything here runs. Additive and idempotent: every statement is
-- IF NOT EXISTS, a guarded ADD, or a default change; nothing rewrites or removes existing rows or objects. No row is inserted here:
-- importing the legacy canonical selection is a separate gate (02B: 20260921b_graphify_execution_authority_legacy_import_DRAFT.sql).
-- Rehearse first:  (echo "BEGIN;"; cat this_file.sql; echo "ROLLBACK;") | psql ...
-- Manual sidecar migration (not in the Drizzle journal), per drizzle/manual convention.
--
-- Model:
--   snapshot / workspace revision = sha256 (immutable)      execution = one event, UUIDv7; started_at/completed_at are the time authority
--   canonical authority = an explicit selection row in graphify_execution_authority (the owner)
--   graphify_executions.canonical_authority = LEGACY COMPATIBILITY FIELD, eventually retired; readers/writers migrate to the authority table
--
-- Deliberately NOT here: no rewrite of the 36 UUIDv4 execution ids; no created_at (started_at exists); no change to the boolean;
-- no cross-table "selected execution must be COMPLETED" trigger (enforced by the single command owner, see the note at the end).

-- 1. New executions get a time-ordered UUIDv7 (PostgreSQL 18). Existing rows keep their ids; this is a default change only.
--    The time inside a UUIDv7 is for ordering/diagnostics; workflow logic uses started_at / completed_at.
ALTER TABLE graphify_executions ALTER COLUMN execution_id SET DEFAULT uuidv7();

-- 2. Referenced side of the composite foreign key: a REAL, NON-PARTIAL unique key, column order matching the FK below.
CREATE UNIQUE INDEX IF NOT EXISTS graphify_executions_ws_rev_id_uidx_v1
  ON graphify_executions (workspace_id, workspace_revision, execution_id);

-- 3. Canonical selection owner. One authority per (workspace_id, workspace_revision), pointing at an execution OF THAT SAME revision.
--    A row is either a live selection or an imported legacy fact; the two never share fields, so no historical provenance is invented:
--      SELECTED         : selected_at / selected_by / selection_receipt REQUIRED; imported_* must be NULL
--      LEGACY_IMPORTED  : selected_* must be NULL (who/when is genuinely unknown); imported_at / import_receipt REQUIRED
--    (Deviation from the review sketch: imported_at/import_receipt are nullable and required only for LEGACY_IMPORTED, because a live
--     selection is not an import. The state name is SELECTED rather than LIVE_PROVEN to avoid overloading the UI badge LIVE_PROVEN.)
CREATE TABLE IF NOT EXISTS graphify_execution_authority (
  workspace_id       uuid        NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  workspace_revision text        NOT NULL CHECK (workspace_revision ~ '^sha256:[a-f0-9]{64}$'),
  execution_id       uuid        NOT NULL,
  authority_state    text        NOT NULL CHECK (authority_state IN ('SELECTED', 'LEGACY_IMPORTED')),
  selected_at        timestamptz,
  selected_by        text,
  selection_receipt  text,
  imported_at        timestamptz,
  import_receipt     text,
  PRIMARY KEY (workspace_id, workspace_revision),
  FOREIGN KEY (workspace_id, workspace_revision, execution_id)
    REFERENCES graphify_executions (workspace_id, workspace_revision, execution_id) ON DELETE RESTRICT,
  CONSTRAINT graphify_execution_authority_state_fields_check_v1 CHECK (
    (authority_state = 'SELECTED'
       AND selected_at IS NOT NULL AND length(coalesce(selected_by, '')) > 0 AND length(coalesce(selection_receipt, '')) > 0
       AND imported_at IS NULL AND import_receipt IS NULL)
    OR
    (authority_state = 'LEGACY_IMPORTED'
       AND selected_at IS NULL AND selected_by IS NULL AND selection_receipt IS NULL
       AND imported_at IS NOT NULL AND length(coalesce(import_receipt, '')) > 0)
  )
);

-- 4. TRANSITIONAL_COMPATIBILITY_GUARD (not the canonical owner): until readers/writers move to the authority table, stop the legacy
--    boolean from being true twice for one revision. Current data has exactly one true row. Retire together with the boolean.
CREATE UNIQUE INDEX IF NOT EXISTS graphify_executions_one_canonical_uidx_v1
  ON graphify_executions (workspace_id, workspace_revision) WHERE canonical_authority IS TRUE;

-- 5. Input identity for RECOGNIZING an identical processing contract over an identical immutable input (e.g. to decide
--    COMPLETED_REUSED). Nullable and NOT backfilled by this file (operator decision). Correction 2026-09-21: parser / extraction / graph-algorithm
--    contract versions ARE recorded on all 36 historical rows; only a feature-contract revision has no column, so a backfill of a reduced recipe is possible later.
--    The runner MUST NOT populate this until the canonical input serialization is frozen and reviewed. Intended recipe:
--      sha256(canonicalEncode({ workspaceId, workspaceRevision, snapshotChecksum, parserRevision, graphifyAlgorithmRevision,
--                               extractionContractRevision, featureContractRevision }))
--    input_identity is NOT executionId, NOT workspaceRevision and NOT canonical authority; several executions may share one.
ALTER TABLE graphify_executions ADD COLUMN IF NOT EXISTS input_identity text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'graphify_executions'::regclass AND conname = 'graphify_executions_input_identity_check_v1') THEN
    ALTER TABLE graphify_executions ADD CONSTRAINT graphify_executions_input_identity_check_v1
      CHECK (input_identity IS NULL OR input_identity ~ '^sha256:[a-f0-9]{64}$');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS graphify_executions_input_identity_idx_v1
  ON graphify_executions (workspace_id, input_identity) WHERE input_identity IS NOT NULL;

-- Command-owner invariant (NOT enforced in SQL; one server function shared by the Studio action, the CLI and MCP):
--   selectCanonicalExecution(): execution exists AND workspace/revision match AND status IN ('COMPLETED','COMPLETED_REUSED')
--   AND snapshot binding = LIVE_PROVEN AND preflight = LIVE_PROVEN AND the expected current authority still matches;
--   then, in ONE transaction: upsert the authority row (authority_state='SELECTED') and write a receipt.
--   canonicalAuthority is then DERIVED:  authority?.execution_id === execution.execution_id.
--
-- Verification (read-only):
--   SELECT column_default FROM information_schema.columns WHERE table_name='graphify_executions' AND column_name='execution_id';  -- uuidv7()
--   SELECT count(*) FROM graphify_execution_authority;              -- 0 after 02A alone (02B imports the legacy row)
--   SELECT count(*) FROM graphify_executions WHERE input_identity IS NOT NULL;   -- 0
--
-- Rollback (manual, not part of this file): remove the objects this file creates -- the table graphify_execution_authority, the
-- indexes graphify_executions_ws_rev_id_uidx_v1 / graphify_executions_one_canonical_uidx_v1 / graphify_executions_input_identity_idx_v1,
-- the constraint graphify_executions_input_identity_check_v1 and the column input_identity -- and set the execution_id default back to
-- gen_random_uuid(). No existing data is changed by this file.

-- Rehearsal evidence (2026-09-21): 02A + 02B were executed inside BEGIN; ... ROLLBACK; against the live database. Every guard failed
-- closed on bad input, and the happy path worked. Nothing persisted (verified after each rollback).
--   1. 02B run WITHOUT atlas.import_receipt              -> ERROR GRAPHIFY_AUTHORITY_IMPORT_REFUSED: atlas.import_receipt must be set
--   2. LEGACY_IMPORTED row carrying a selector (selected_by)  -> rejected by graphify_execution_authority_state_fields_check_v1
--   3. SELECTED row missing selected_by                   -> rejected by graphify_execution_authority_state_fields_check_v1
--   4. authority row pointing at an execution of ANOTHER revision -> rejected by the composite foreign key
--   5. second legacy canonical execution for one revision -> rejected by unique index graphify_executions_one_canonical_uidx_v1
--   6. valid SELECTED row                                 -> accepted (INSERT 0 1)
--   Positive path: default = uuidv7(); one LEGACY_IMPORTED row with selected_at/selected_by/selection_receipt NULL and import_receipt set.
