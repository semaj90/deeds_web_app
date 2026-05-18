-- Phase 11: add auth_user_id, trust_tier, validation to llm_synthesis_events
-- Safe to re-run (IF NOT EXISTS / column-exists guard via DO block)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_synthesis_events' AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE llm_synthesis_events ADD COLUMN auth_user_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_synthesis_events' AND column_name = 'trust_tier'
  ) THEN
    ALTER TABLE llm_synthesis_events ADD COLUMN trust_tier text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_synthesis_events' AND column_name = 'validation'
  ) THEN
    ALTER TABLE llm_synthesis_events ADD COLUMN validation jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END
$$;
