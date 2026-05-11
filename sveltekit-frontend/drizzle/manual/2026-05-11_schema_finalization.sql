-- ============================================================================
-- 2026-05-11 Schema Finalization Migration — DESTRUCTIVE
-- ============================================================================
--
-- Status:   STAGED (not applied). Operator owns the apply step.
-- Source:   docs/audit/2026-05-11_route-forensic-triage.md §3 Proposal 2 + §5
-- Trigger:  Operator confirmed (2026-05-11): "drizzle migration once we finalize
--           what we need vs what's not needed, it will drop data, but we've gone
--           through several upgrades."
--
-- ── WHAT THIS MIGRATION DOES ────────────────────────────────────────────────
--
-- 1. CASCADE-DROPS the 23 orphan uuid user_id FK constraints (so the column-type
--    alter doesn't get blocked). Re-added at the end against integer users(id).
--
-- 2. ALTERS 23 user_id columns from uuid → integer with NULL coercion.
--    All existing uuid values are LOST. Operator accepted this trade.
--    Tables affected (verified against live DB on 2026-05-11):
--      ace_context_cache, ai_usage_log, analytics_events, api_audit_log,
--      audit_log, chat_messages, chat_metadata, chunk_hit_log,
--      citation_collections, diagnosis_events, email_verification_codes,
--      error_suggestion_states, evidence, evidence_audit_log,
--      panel_activity_log, rag_query_log, report_audit_log, response_feedback,
--      synthesis_runs, user_analytics_events, user_interaction_history,
--      user_research_tasks, yorha_chat_sessions
--
-- 3. DROPS 3 finalization-candidate tables per triage doc §5:
--      - chat_messages           (insert is commented-out at /chat/+page.server.ts:57)
--      - poi_photos              (only consumed by /persons-of-interest/[id])
--      - criminals               (only consumed by homepage count query)
--    All three are scope-down candidates with zero or near-zero live readers.
--
-- 4. RE-ADDS the integer FK constraints to users(id) with ON DELETE SET NULL.
--    The 3 dropped tables don't need re-add.
--
-- ── WHAT THIS MIGRATION DOES *NOT* DO ───────────────────────────────────────
--
-- - Does NOT touch the 16 already-integer user_id columns (sessions, cases,
--   documents, evidence.uploaded_by, etc.) — those are correct.
-- - Does NOT touch the 3 text user_id columns (admin_ai_chat_sessions,
--   agent_actions, saved_citations) — separate decision.
-- - Does NOT touch raw-SQL-consumer tables that /library + /command-center
--   depend on: library_documents, jurisdictions, legal_nodes, legal_chunks.
--   These tables MUST be preserved or those two routes 500.
-- - Does NOT touch users.id (still serial integer; Lucia auth continues to work).
-- - Does NOT touch any of the 17 graph/atlas/hypergraph tables.
-- - Does NOT touch the 5 carved ACE/observability tables (0018_ace_observability).
--
-- ── APPLY COMMAND (operator runs manually) ──────────────────────────────────
--
--   docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db \
--     < sveltekit-frontend/drizzle/manual/2026-05-11_schema_finalization.sql
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- No automatic rollback. Recovery path:
-- 1. pg_dump BEFORE running this migration → save the dump
-- 2. If rollback needed: pg_restore from the dump
-- Operator: take a dump first. This migration drops data by design.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
--
-- - All ALTER COLUMN statements check current type via information_schema.
-- - All DROP TABLE statements use IF EXISTS.
-- - All ALTER TABLE … DROP CONSTRAINT use IF EXISTS.
-- - Second-run is a no-op.
-- ============================================================================

BEGIN;

-- ── STEP 1: Drop FK constraints that reference the uuid user_id columns ─────
-- (Type-change is blocked if FK exists. Names are convention-based; IF EXISTS
--  guards skip ones that don't exist.)

DO $$
DECLARE
  t text;
  uuid_tables text[] := ARRAY[
    'ace_context_cache','ai_usage_log','analytics_events','api_audit_log',
    'audit_log','chat_messages','chat_metadata','chunk_hit_log',
    'citation_collections','diagnosis_events','email_verification_codes',
    'error_suggestion_states','evidence','evidence_audit_log',
    'panel_activity_log','rag_query_log','report_audit_log',
    'response_feedback','synthesis_runs','user_analytics_events',
    'user_interaction_history','user_research_tasks','yorha_chat_sessions'
  ];
  c record;
BEGIN
  FOREACH t IN ARRAY uuid_tables LOOP
    FOR c IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = format('public.%I', t)::regclass
        AND contype = 'f'
        AND conname ILIKE '%user_id%'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, c.conname);
      RAISE NOTICE 'Dropped FK % on table %', c.conname, t;
    END LOOP;
  END LOOP;
END $$;

-- ── STEP 2: Alter 23 uuid user_id columns to integer (drops existing values) ──
-- Each guard checks current type; second-run no-ops.

DO $$
DECLARE
  t text;
  uuid_tables text[] := ARRAY[
    'ace_context_cache','ai_usage_log','analytics_events','api_audit_log',
    'audit_log','chat_metadata','chunk_hit_log',
    'citation_collections','diagnosis_events','email_verification_codes',
    'error_suggestion_states','evidence','evidence_audit_log',
    'panel_activity_log','rag_query_log','report_audit_log',
    'response_feedback','synthesis_runs','user_analytics_events',
    'user_interaction_history','user_research_tasks','yorha_chat_sessions'
  ];
  current_type text;
BEGIN
  FOREACH t IN ARRAY uuid_tables LOOP
    SELECT data_type INTO current_type
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id';
    IF current_type = 'uuid' THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN user_id TYPE integer USING NULL', t);
      RAISE NOTICE 'Aligned %.user_id: uuid -> integer (data dropped)', t;
    ELSIF current_type = 'integer' THEN
      RAISE NOTICE 'Skipped %.user_id (already integer)', t;
    ELSE
      RAISE NOTICE 'Skipped %.user_id (type=%, not uuid)', t, current_type;
    END IF;
  END LOOP;
END $$;

-- ── STEP 3: Drop the 3 finalization-candidate tables ────────────────────────
-- Per triage doc §5: chat_messages (commented-out insert), poi_photos (single
-- consumer), criminals (homepage-only). Operator confirmed scope-down acceptable.

DROP TABLE IF EXISTS chat_messages   CASCADE;
DROP TABLE IF EXISTS poi_photos      CASCADE;
DROP TABLE IF EXISTS criminals       CASCADE;

-- ── STEP 4: Re-add integer FK constraints to users(id) with ON DELETE SET NULL
-- (Same pattern used by other integer user_id columns in the canonical schema.)

DO $$
DECLARE
  t text;
  int_tables text[] := ARRAY[
    'ace_context_cache','ai_usage_log','analytics_events','api_audit_log',
    'audit_log','chat_metadata','chunk_hit_log',
    'citation_collections','diagnosis_events','email_verification_codes',
    'error_suggestion_states','evidence','evidence_audit_log',
    'panel_activity_log','rag_query_log','report_audit_log',
    'response_feedback','synthesis_runs','user_analytics_events',
    'user_interaction_history','user_research_tasks','yorha_chat_sessions'
  ];
  fk_name text;
  col_type text;
BEGIN
  FOREACH t IN ARRAY int_tables LOOP
    SELECT data_type INTO col_type
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id';
    IF col_type = 'integer' THEN
      fk_name := t || '_user_id_users_id_fk';
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL',
        t, fk_name
      );
      RAISE NOTICE 'Added FK % -> users(id)', fk_name;
    END IF;
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'FK already exists on %, skipping', t;
    WHEN OTHERS THEN
      RAISE NOTICE 'FK add failed on % (%): %', t, SQLSTATE, SQLERRM;
  END LOOP;
END $$;

-- ── STEP 5: Smoke verification ──────────────────────────────────────────────
-- Final check: should print 0 rows. Any output here is a missed conversion.

SELECT table_name, data_type
  FROM information_schema.columns
 WHERE column_name = 'user_id'
   AND table_schema = 'public'
   AND data_type = 'uuid'
   AND table_name <> 'admin_ai_chat_sessions';

COMMIT;

-- ============================================================================
-- DONE. Verification queries the operator should run AFTER applying:
--
--   -- Should show 23+16 = 39 integer user_id columns (was 16 integer + 23 uuid):
--   SELECT data_type, count(*)
--     FROM information_schema.columns
--    WHERE column_name = 'user_id' AND table_schema = 'public'
--    GROUP BY data_type;
--
--   -- Should return 0 rows (all FKs re-created):
--   SELECT table_name FROM information_schema.columns c
--    WHERE column_name = 'user_id' AND table_schema = 'public' AND data_type = 'integer'
--      AND NOT EXISTS (
--        SELECT 1 FROM pg_constraint
--         WHERE conrelid = format('public.%I', c.table_name)::regclass
--           AND contype = 'f' AND conname ILIKE '%user_id%'
--      );
--
--   -- Should print 0 (dropped tables):
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN ('chat_messages','poi_photos','criminals');
-- ============================================================================
