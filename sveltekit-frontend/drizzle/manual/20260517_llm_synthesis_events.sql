-- Phase 11 LLM Synthesis Events durable audit log table

CREATE TABLE IF NOT EXISTS llm_synthesis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  session_id text,
  user_id integer,
  query text NOT NULL,
  profile text NOT NULL,
  ace_packet jsonb NOT NULL,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  cache_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_synthesis_events_run_id_idx ON llm_synthesis_events(run_id);
CREATE INDEX IF NOT EXISTS llm_synthesis_events_session_id_idx ON llm_synthesis_events(session_id);
CREATE INDEX IF NOT EXISTS llm_synthesis_events_user_id_idx ON llm_synthesis_events(user_id);
CREATE INDEX IF NOT EXISTS llm_synthesis_events_created_at_idx ON llm_synthesis_events(created_at);
