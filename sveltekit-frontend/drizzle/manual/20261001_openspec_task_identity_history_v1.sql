-- Stable logical OpenSpec task identity and immutable claim-revision history.
-- Design-only additive migration; do not apply without schema-owner review,
-- deterministic census parity, dry-run/readback receipts, and authorization.

ALTER TABLE public.openspec_tasks
  ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS canonical_task_key text,
  ADD COLUMN IF NOT EXISTS authority_scope text,
  ADD COLUMN IF NOT EXISTS declared_task_id text,
  ADD COLUMN IF NOT EXISTS identity_kind text,
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS current_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS openspec_tasks_surrogate_id_uidx
  ON public.openspec_tasks (id);
CREATE UNIQUE INDEX IF NOT EXISTS openspec_tasks_canonical_key_uidx
  ON public.openspec_tasks (canonical_task_key);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'openspec_tasks_identity_kind_check') THEN
    ALTER TABLE public.openspec_tasks
      ADD CONSTRAINT openspec_tasks_identity_kind_check
      CHECK (identity_kind IS NULL OR identity_kind IN ('DECLARED_TASK_ID', 'MIGRATION_KEY', 'GATE_ID', 'REQUIREMENT_ID', 'STABLE_ANCHOR', 'DERIVED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'openspec_tasks_lifecycle_state_check') THEN
    ALTER TABLE public.openspec_tasks
      ADD CONSTRAINT openspec_tasks_lifecycle_state_check
      CHECK (lifecycle_state IN ('ACTIVE', 'FINALIZED', 'SUPERSEDED', 'ARCHIVED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'openspec_tasks_current_revision_check') THEN
    ALTER TABLE public.openspec_tasks
      ADD CONSTRAINT openspec_tasks_current_revision_check
      CHECK (current_revision >= 1);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.openspec_task_revisions (
  task_row_id bigint NOT NULL REFERENCES public.openspec_tasks(id),
  canonical_task_key text NOT NULL REFERENCES public.openspec_tasks(canonical_task_key),
  revision bigint NOT NULL CHECK (revision >= 1),
  source_path text NOT NULL,
  source_line integer,
  source_anchor text,
  claim_text text NOT NULL,
  claim_hash text NOT NULL,
  declared_checked boolean NOT NULL,
  workspace_revision text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  observation_checksum text NOT NULL,
  PRIMARY KEY (task_row_id, revision),
  UNIQUE (canonical_task_key, revision),
  UNIQUE (task_row_id, revision, observation_checksum)
);

ALTER TABLE public.evidence_receipts
  ADD COLUMN IF NOT EXISTS canonical_task_key text,
  ADD COLUMN IF NOT EXISTS task_revision bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evidence_receipts_canonical_task_fk') THEN
    ALTER TABLE public.evidence_receipts
      ADD CONSTRAINT evidence_receipts_canonical_task_fk
      FOREIGN KEY (canonical_task_key) REFERENCES public.openspec_tasks(canonical_task_key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evidence_receipts_task_revision_fk') THEN
    ALTER TABLE public.evidence_receipts
      ADD CONSTRAINT evidence_receipts_task_revision_fk
      FOREIGN KEY (canonical_task_key, task_revision)
      REFERENCES public.openspec_task_revisions(canonical_task_key, revision);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evidence_receipts_task_revision_check') THEN
    ALTER TABLE public.evidence_receipts
      ADD CONSTRAINT evidence_receipts_task_revision_check
      CHECK (task_revision IS NULL OR task_revision >= 1);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.openspec_task_aliases (
  alias_key text PRIMARY KEY,
  task_row_id bigint NOT NULL REFERENCES public.openspec_tasks(id),
  alias_kind text NOT NULL CHECK (alias_kind IN ('DERIVED_KEY', 'MIGRATION_KEY', 'GATE_ID', 'REQUIREMENT_ID', 'RENAMED_ID', 'MOVED_KEY', 'MIRROR_KEY', 'LEGACY_KEY')),
  source_ref text,
  workspace_revision text NOT NULL,
  checksum text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS openspec_task_revisions_claim_hash_idx
  ON public.openspec_task_revisions (task_row_id, claim_hash);
CREATE INDEX IF NOT EXISTS openspec_task_revisions_workspace_idx
  ON public.openspec_task_revisions (workspace_revision, observed_at);
CREATE INDEX IF NOT EXISTS openspec_task_aliases_task_idx
  ON public.openspec_task_aliases (task_row_id, alias_kind);

CREATE OR REPLACE FUNCTION public.reject_openspec_identity_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'OpenSpec identity history is append-only; % is forbidden', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'openspec_task_revisions_append_only'
      AND tgrelid = 'public.openspec_task_revisions'::regclass
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER openspec_task_revisions_append_only
      BEFORE UPDATE OR DELETE OR TRUNCATE ON public.openspec_task_revisions
      FOR EACH STATEMENT EXECUTE FUNCTION public.reject_openspec_identity_history_mutation()';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'openspec_task_aliases_append_only'
      AND tgrelid = 'public.openspec_task_aliases'::regclass
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER openspec_task_aliases_append_only
      BEFORE UPDATE OR DELETE OR TRUNCATE ON public.openspec_task_aliases
      FOR EACH STATEMENT EXECUTE FUNCTION public.reject_openspec_identity_history_mutation()';
  END IF;
END $$;
