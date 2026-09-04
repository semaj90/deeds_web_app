-- GRAPHIFY-DAILY-CANARY-02 proof (partial: run A vs run B over byte-identical source bytes).
-- parent-atlas-retrieval-lineage-dag-convergence, 2026-09-04.
--
-- Proves the migration's own post-apply gate order step 3
-- (sveltekit-frontend/drizzle/manual/20260903_graphify_execution_ledger_v1.sql, bottom comment):
--   executionId_A != executionId_B
--   workspaceRevision_A == workspaceRevision_B
-- for two executions inserted under the SAME (workspace_id, workspace_revision,
-- parser_contract_version, extraction_contract_version) tuple. Also sanity-checks the frozen
-- advisory-lock namespace/key from docs/reports/graphify-execution-ledger-coordinator-plan-v1.json.
--
-- NOT proven here (left open, tracked in tasks.md under GRAPHIFY-DAILY-CANARY-02): execution C
-- (one canary source's bytes changed -> workspaceRevision must DIFFER from A/B's). That needs a
-- real second workspace-revision value derived the same way production does (sha256 of the sorted
-- exact-byte source manifest), not a second synthetic literal -- deliberately not faked here.
--
-- SAFETY CONTRACT: this script performs ZERO persistent writes. It must always be run wrapped in
-- an outer transaction that ends in ROLLBACK, against a real (or throwaway) database -- never run
-- the INSERTs below outside a transaction you intend to roll back.
--
-- Usage (two ways):
--   1. Local psql with real \i support (working directory = repo root):
--        psql "$DATABASE_URL" <<'SQL'
--        BEGIN;
--        \i sveltekit-frontend/drizzle/manual/20260903_graphify_execution_ledger_v1.sql
--        -- NOTE: the migration file itself contains BEGIN;/COMMIT; -- if running this way, the
--        -- migration's own COMMIT will end your outer transaction early. Either strip those two
--        -- lines from a scratch copy first (see method 2), or run the migration separately in its
--        -- own committed transaction against a disposable database, then run this file's body
--        -- (skipping the \i line) in a second transaction you roll back.
--        \i sveltekit-frontend/scripts/atlas/graphify-daily-canary-02-proof-2026-09-04.sql
--        ROLLBACK;
--        SQL
--   2. Combined-and-stripped (the exact method used to produce the 2026-09-04 proof recorded in
--      tasks.md -- avoids the BEGIN/COMMIT collision from method 1 entirely):
--        grep -v -E '^(BEGIN|COMMIT);$' \
--          sveltekit-frontend/drizzle/manual/20260903_graphify_execution_ledger_v1.sql \
--          > /tmp/migration-body-only.sql
--        { echo 'BEGIN;'; cat /tmp/migration-body-only.sql; \
--          cat sveltekit-frontend/scripts/atlas/graphify-daily-canary-02-proof-2026-09-04.sql; \
--        } | psql "$DATABASE_URL"

-- Existing workspace row to reuse as FK target (read-only reuse, never mutated). Replace with any
-- real row from `SELECT id FROM workspaces LIMIT 1;` on the target database if this specific id
-- doesn't exist there.
\set canary_workspace_id '625743d2-092b-4fa8-abe0-9dc094920c80'

INSERT INTO public.graphify_executions
  (workspace_id, workspace_revision, parser_contract_version, extraction_contract_version,
   trigger_kind, status, completed_at)
VALUES
  (:'canary_workspace_id'::uuid, 'sha256:' || repeat('a', 64),
   'graphify.parser.v0.1', 'graphify.extractor.v0.1', 'CANARY_PROOF', 'COMPLETED', now())
RETURNING execution_id AS execution_a \gset

INSERT INTO public.graphify_executions
  (workspace_id, workspace_revision, parser_contract_version, extraction_contract_version,
   trigger_kind, status, completed_at)
VALUES
  (:'canary_workspace_id'::uuid, 'sha256:' || repeat('a', 64),
   'graphify.parser.v0.1', 'graphify.extractor.v0.1', 'CANARY_PROOF', 'COMPLETED', now())
RETURNING execution_id AS execution_b \gset

INSERT INTO public.graphify_execution_files
  (execution_id, workspace_revision, source_ref, code_source_revision, content_hash, byte_length)
VALUES
  (:'execution_a', 'sha256:' || repeat('a', 64), 'canary/one.ts', 'sha256:' || repeat('1', 64), 'sha256:' || repeat('2', 64), 100),
  (:'execution_a', 'sha256:' || repeat('a', 64), 'canary/two.ts', 'sha256:' || repeat('3', 64), 'sha256:' || repeat('4', 64), 200),
  (:'execution_b', 'sha256:' || repeat('a', 64), 'canary/one.ts', 'sha256:' || repeat('1', 64), 'sha256:' || repeat('2', 64), 100),
  (:'execution_b', 'sha256:' || repeat('a', 64), 'canary/two.ts', 'sha256:' || repeat('3', 64), 'sha256:' || repeat('4', 64), 200);

-- The canary assertion.
SELECT
  :'execution_a' AS execution_id_a,
  :'execution_b' AS execution_id_b,
  (:'execution_a' != :'execution_b') AS execution_ids_distinct,
  (SELECT workspace_revision FROM public.graphify_executions WHERE execution_id = :'execution_a')
    = (SELECT workspace_revision FROM public.graphify_executions WHERE execution_id = :'execution_b')
    AS workspace_revisions_identical,
  (SELECT count(*) FROM public.graphify_execution_files WHERE execution_id = :'execution_a') AS files_under_a,
  (SELECT count(*) FROM public.graphify_execution_files WHERE execution_id = :'execution_b') AS files_under_b;

-- Advisory-lock contract sanity check (namespace/key frozen in
-- docs/reports/graphify-execution-ledger-coordinator-plan-v1.json). Session-level advisory locks
-- are re-entrant/stacked per session -- verified live 2026-09-04: a second try-lock for the same
-- key on the same connection ALSO returns true (does not report "already held"), so the eventual
-- coordinator must call try_lock exactly once per attempt and unlock exactly once in `finally`.
SELECT pg_try_advisory_lock(119041, 641934821) AS first_try_lock;
SELECT pg_try_advisory_lock(119041, 641934821) AS second_try_same_session_also_true_reentrant;
SELECT pg_advisory_unlock(119041, 641934821) AS first_unlock;
SELECT pg_advisory_unlock(119041, 641934821) AS second_unlock_still_true_one_hold_remained;
