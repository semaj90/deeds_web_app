-- Migration: 0014_user_research_tasks
-- Persistent research task queue — syncs to server for authenticated users,
-- falls back to sessionId cookie for anonymous users.

CREATE TABLE IF NOT EXISTS user_research_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id    TEXT,
  title         TEXT NOT NULL,
  self_prompt   TEXT NOT NULL,
  pipeline_hint TEXT NOT NULL DEFAULT 'ace',
  priority      TEXT NOT NULL DEFAULT 'medium',
  status        TEXT NOT NULL DEFAULT 'pending',
  source_text   TEXT,
  summary       TEXT,
  result        JSONB,
  notified      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS urt_user_status  ON user_research_tasks (user_id, status);
CREATE INDEX IF NOT EXISTS urt_user_created ON user_research_tasks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS urt_session      ON user_research_tasks (session_id);