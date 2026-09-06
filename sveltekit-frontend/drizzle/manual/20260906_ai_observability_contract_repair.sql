-- Additive repair for the AI observability contracts used by the facade.
-- This is intentionally a manual sidecar migration: the repository's global
-- Drizzle journal is not a safe authority for the current live baseline.

CREATE TABLE IF NOT EXISTS public.intent_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  user_query text NOT NULL,
  predicted_intent text NOT NULL,
  confidence real NOT NULL DEFAULT 0,
  selected_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  cache_hit boolean NOT NULL DEFAULT false,
  user_accepted boolean,
  correction_label text,
  reward real,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intent_eval_runs_run_id
  ON public.intent_eval_runs (run_id);
CREATE INDEX IF NOT EXISTS idx_intent_eval_runs_predicted_intent
  ON public.intent_eval_runs (predicted_intent);

CREATE TABLE IF NOT EXISTS public.llm_synthesis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  session_id text,
  user_id integer,
  auth_user_id text,
  query text NOT NULL,
  profile text NOT NULL,
  ace_packet jsonb NOT NULL,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  cache_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  routing_hints jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust_tier text,
  model text NOT NULL,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.llm_synthesis_events
  ADD COLUMN IF NOT EXISTS auth_user_id text;
ALTER TABLE public.llm_synthesis_events
  ADD COLUMN IF NOT EXISTS routing_hints jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.llm_synthesis_events
  ADD COLUMN IF NOT EXISTS trust_tier text;
ALTER TABLE public.llm_synthesis_events
  ADD COLUMN IF NOT EXISTS validation jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS llm_synthesis_events_run_id_idx
  ON public.llm_synthesis_events (run_id);
CREATE INDEX IF NOT EXISTS llm_synthesis_events_session_id_idx
  ON public.llm_synthesis_events (session_id);
CREATE INDEX IF NOT EXISTS llm_synthesis_events_user_id_idx
  ON public.llm_synthesis_events (user_id);
CREATE INDEX IF NOT EXISTS llm_synthesis_events_created_at_idx
  ON public.llm_synthesis_events (created_at);
