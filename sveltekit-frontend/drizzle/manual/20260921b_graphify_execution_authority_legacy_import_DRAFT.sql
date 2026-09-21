-- GRAPHIFY-EXECUTION-IDENTITY-MODEL-02B (2026-09-21). LEGACY AUTHORITY IMPORT. DRAFT: NOT APPLIED. Runs only AFTER 02A is applied.
-- Requires explicit operator sign-off. Inserts at most one row per (workspace_id, workspace_revision): the execution that the legacy
-- boolean already marks canonical. It records that FACT as LEGACY_IMPORTED; it does not invent who selected it or when
-- (selected_at / selected_by / selection_receipt stay NULL). The import receipt must be a REAL apply/migration receipt id supplied by
-- the operator at apply time; this file refuses to run without one and never fabricates it.
--
-- Apply wrapper (example; the receipt value is the operator's real receipt id, not a placeholder):
--   BEGIN;
--   SET LOCAL atlas.import_receipt = '<real apply receipt id>';
--   \i 20260921b_graphify_execution_authority_legacy_import_DRAFT.sql
--   COMMIT;
-- Rehearse the same wrapper with ROLLBACK instead of COMMIT and a value that is obviously a rehearsal.

DO $$
DECLARE
  receipt text := current_setting('atlas.import_receipt', true);
  duplicate_revisions int;
  not_completed int;
BEGIN
  IF receipt IS NULL OR length(receipt) = 0 THEN
    RAISE EXCEPTION 'GRAPHIFY_AUTHORITY_IMPORT_REFUSED: atlas.import_receipt must be set to a real apply receipt id';
  END IF;

  -- Precondition 1: exactly 0 or 1 legacy canonical execution per (workspace_id, workspace_revision).
  SELECT count(*) INTO duplicate_revisions FROM (
    SELECT workspace_id, workspace_revision FROM graphify_executions
     WHERE canonical_authority IS TRUE GROUP BY 1, 2 HAVING count(*) > 1
  ) d;
  IF duplicate_revisions > 0 THEN
    RAISE EXCEPTION 'GRAPHIFY_AUTHORITY_IMPORT_REFUSED: % revision(s) have more than one legacy canonical execution', duplicate_revisions;
  END IF;

  -- Precondition 2: a canonical execution must have finished successfully.
  SELECT count(*) INTO not_completed FROM graphify_executions
   WHERE canonical_authority IS TRUE AND status NOT IN ('COMPLETED', 'COMPLETED_REUSED');
  IF not_completed > 0 THEN
    RAISE EXCEPTION 'GRAPHIFY_AUTHORITY_IMPORT_REFUSED: % legacy canonical execution(s) are not COMPLETED/COMPLETED_REUSED', not_completed;
  END IF;

  INSERT INTO graphify_execution_authority
    (workspace_id, workspace_revision, execution_id, authority_state, imported_at, import_receipt)
  SELECT e.workspace_id, e.workspace_revision, e.execution_id, 'LEGACY_IMPORTED', now(), receipt
    FROM graphify_executions e
   WHERE e.canonical_authority IS TRUE
  ON CONFLICT (workspace_id, workspace_revision) DO NOTHING;
END $$;

-- Verification (read-only):
--   SELECT authority_state, selected_at, selected_by, selection_receipt, imported_at, import_receipt FROM graphify_execution_authority;
--   SELECT a.execution_id, e.canonical_authority FROM graphify_execution_authority a
--     JOIN graphify_executions e USING (workspace_id, workspace_revision, execution_id);      -- canonical_authority = true
