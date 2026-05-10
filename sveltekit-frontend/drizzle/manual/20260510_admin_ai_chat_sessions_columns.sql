-- Migration: align admin_ai_chat_sessions columns with ai-chat-service.ts code references.
--
-- Surfaced 2026-05-10 by /api/admin/ai-chat/sessions returning 500 with:
--   error: column "context_tag" does not exist
--
-- The service (src/lib/server/admin/ai-chat-service.ts) uses raw pg.Pool (not Drizzle)
-- and references both `context_tag` and `active` columns — neither of which existed in
-- the DB. The ON CONFLICT clause also requires a partial UNIQUE index keyed on
-- (user_id, context_tag) WHERE active = true.
--
-- Apply: psql $DATABASE_URL -f drizzle/manual/20260510_admin_ai_chat_sessions_columns.sql
-- Idempotent — safe to re-run.

ALTER TABLE admin_ai_chat_sessions
  ADD COLUMN IF NOT EXISTS context_tag text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS active      boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS admin_ai_chat_sessions_user_context_active_unique
  ON admin_ai_chat_sessions (user_id, context_tag) WHERE active = true;
