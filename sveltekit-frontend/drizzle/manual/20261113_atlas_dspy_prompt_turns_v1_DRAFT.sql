-- sveltekit-frontend/drizzle/manual/20261113_atlas_dspy_prompt_turns_v1_DRAFT.sql
-- DRAFT MIGRATION ONLY — NOT APPLIED TO ANY DATABASE.
-- Tracks DSPy prompt signatures, frozen context prefix digests, verifier commands,
-- rewards, and bounded multi-turn execution (max 3 turns) with a hard scratch-DB guard.
-- Follows the Drizzle sidecar rule: review and apply transactionally via migrate, never push.

DO $$
BEGIN
    IF current_database() <> 'legal_ai_live_integration_scratch' THEN
        RAISE EXCEPTION 'SCRATCH_ONLY_MIGRATION_GUARD: 20261113_atlas_dspy_prompt_turns_v1_DRAFT.sql may only run on legal_ai_live_integration_scratch';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.atlas_dspy_prompt_turns_v1 (
    prompt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signature_name TEXT NOT NULL,
    prompt_revision TEXT NOT NULL,
    model_id TEXT NOT NULL,
    adapter_rev TEXT,
    prefix_sha256 CHAR(64) NOT NULL CHECK (prefix_sha256 ~ '^[0-9a-f]{64}$'),
    inputs_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    outputs_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    verifier_cmd TEXT NOT NULL CHECK (char_length(trim(verifier_cmd)) > 0),
    reward DOUBLE PRECISION NOT NULL CHECK (reward >= -1.0 AND reward <= 1.0),
    task_key TEXT NOT NULL,
    turn INTEGER NOT NULL CHECK (turn BETWEEN 1 AND 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_dspy_inputs_no_forbidden_keys
        CHECK (NOT (inputs_schema ?| ARRAY['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor'])),
    CONSTRAINT chk_dspy_outputs_no_forbidden_keys
        CHECK (NOT (outputs_schema ?| ARRAY['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor']))
);

CREATE INDEX IF NOT EXISTS idx_atlas_dspy_prompt_turns_v1_task_turn
    ON public.atlas_dspy_prompt_turns_v1 (task_key, turn);

CREATE INDEX IF NOT EXISTS idx_atlas_dspy_prompt_turns_v1_sig_rev
    ON public.atlas_dspy_prompt_turns_v1 (signature_name, prompt_revision);
