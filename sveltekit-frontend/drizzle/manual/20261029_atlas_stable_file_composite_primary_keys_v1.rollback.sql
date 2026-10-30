BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.atlas_stable_file_revision_binding)
     OR EXISTS (SELECT 1 FROM public.atlas_stable_file_alias) THEN
    RAISE EXCEPTION 'Refusing rollback: stable-file relations must be empty';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atlas_stable_file_revision_binding'::regclass
      AND conname = 'atlas_stable_file_revision_bi_stable_file_id_workspace_revi_key'
      AND contype = 'p'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (stable_file_id, workspace_revision)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atlas_stable_file_alias'::regclass
      AND conname = 'atlas_stable_file_alias_stable_file_id_alias_path_introduce_key'
      AND contype = 'p'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (stable_file_id, alias_path, introduced_in_workspace_revision)'
  ) THEN
    RAISE EXCEPTION 'Refusing rollback: expected composite primary keys are absent or differ';
  END IF;
END
$$;

ALTER TABLE public.atlas_stable_file_revision_binding
  DROP CONSTRAINT atlas_stable_file_revision_bi_stable_file_id_workspace_revi_key,
  ADD CONSTRAINT atlas_stable_file_revision_bi_stable_file_id_workspace_revi_key
    UNIQUE (stable_file_id, workspace_revision);

ALTER TABLE public.atlas_stable_file_alias
  DROP CONSTRAINT atlas_stable_file_alias_stable_file_id_alias_path_introduce_key,
  ADD CONSTRAINT atlas_stable_file_alias_stable_file_id_alias_path_introduce_key
    UNIQUE (stable_file_id, alias_path, introduced_in_workspace_revision);

COMMIT;
