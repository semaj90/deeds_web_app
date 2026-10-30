BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('public.atlas_stable_file_revision_binding') IS NULL
     OR to_regclass('public.atlas_stable_file_alias') IS NULL THEN
    RAISE EXCEPTION 'Stable-file tables are missing';
  END IF;

  IF EXISTS (SELECT 1 FROM public.atlas_stable_file_revision_binding)
     OR EXISTS (SELECT 1 FROM public.atlas_stable_file_alias) THEN
    RAISE EXCEPTION 'Refusing key promotion: stable-file relations must be empty';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atlas_stable_file_revision_binding'::regclass
      AND contype = 'p'
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atlas_stable_file_alias'::regclass
      AND contype = 'p'
  ) THEN
    RAISE EXCEPTION 'Refusing key promotion: a primary key already exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atlas_stable_file_revision_binding'::regclass
      AND conname = 'atlas_stable_file_revision_bi_stable_file_id_workspace_revi_key'
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (stable_file_id, workspace_revision)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atlas_stable_file_alias'::regclass
      AND conname = 'atlas_stable_file_alias_stable_file_id_alias_path_introduce_key'
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (stable_file_id, alias_path, introduced_in_workspace_revision)'
  ) THEN
    RAISE EXCEPTION 'Refusing key promotion: expected composite UNIQUE constraints are absent or differ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'atlas_stable_file_revision_binding.stable_file_id',
      'atlas_stable_file_revision_binding.workspace_revision',
      'atlas_stable_file_alias.stable_file_id',
      'atlas_stable_file_alias.alias_path',
      'atlas_stable_file_alias.introduced_in_workspace_revision'
    ]) AS target(column_ref)
    CROSS JOIN LATERAL (
      SELECT split_part(target.column_ref, '.', 1) AS table_name,
             split_part(target.column_ref, '.', 2) AS column_name
    ) parsed
    JOIN pg_class c ON c.oid = to_regclass('public.' || parsed.table_name)
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = parsed.column_name
    WHERE NOT a.attnotnull
  ) THEN
    RAISE EXCEPTION 'Refusing key promotion: one or more candidate key columns are nullable';
  END IF;
END
$$;

ALTER TABLE public.atlas_stable_file_revision_binding
  DROP CONSTRAINT atlas_stable_file_revision_bi_stable_file_id_workspace_revi_key,
  ADD CONSTRAINT atlas_stable_file_revision_bi_stable_file_id_workspace_revi_key
    PRIMARY KEY (stable_file_id, workspace_revision);

ALTER TABLE public.atlas_stable_file_alias
  DROP CONSTRAINT atlas_stable_file_alias_stable_file_id_alias_path_introduce_key,
  ADD CONSTRAINT atlas_stable_file_alias_stable_file_id_alias_path_introduce_key
    PRIMARY KEY (stable_file_id, alias_path, introduced_in_workspace_revision);

COMMIT;
