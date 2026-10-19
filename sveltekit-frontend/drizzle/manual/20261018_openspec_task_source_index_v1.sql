-- Immutable, rebuildable source index for unchecked OpenSpec task observations.
-- The source tasks.md files remain authoritative. This is not the executable Kanban
-- queue and does not admit derived task identities as canonical task keys.

CREATE TABLE IF NOT EXISTS public.openspec_task_source_snapshots_v1 (
  snapshot_id text PRIMARY KEY,
  workspace_revision text NOT NULL,
  input_checksum text NOT NULL,
  source_row_count integer NOT NULL CHECK (source_row_count >= 0),
  snapshot_status text NOT NULL CHECK (snapshot_status = 'COMPLETE'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.openspec_task_source_index_v1 (
  snapshot_id text NOT NULL REFERENCES public.openspec_task_source_snapshots_v1(snapshot_id),
  source_ref text NOT NULL,
  change_id text NOT NULL,
  source_line integer NOT NULL CHECK (source_line > 0),
  task_text text NOT NULL,
  task_hash text NOT NULL,
  task_status text NOT NULL CHECK (task_status = 'OPEN'),
  identity_status text NOT NULL CHECK (identity_status IN ('DECLARED_ID', 'DERIVED_ID', 'AMBIGUOUS')),
  canonical_task_key_candidate text,
  archived boolean NOT NULL DEFAULT false,
  PRIMARY KEY (snapshot_id, source_ref),
  CHECK (source_ref ~ '^(openspec|sveltekit-frontend/openspec)/changes/.+/tasks\.md#L[1-9][0-9]*$')
);

CREATE INDEX IF NOT EXISTS openspec_task_source_index_v1_source_ref_idx
  ON public.openspec_task_source_index_v1 (source_ref, snapshot_id);
CREATE INDEX IF NOT EXISTS openspec_task_source_index_v1_snapshot_change_idx
  ON public.openspec_task_source_index_v1 (snapshot_id, change_id, source_line);

COMMENT ON TABLE public.openspec_task_source_index_v1 IS
  'Read-only source projection of unchecked OpenSpec task lines. It is not canonical task identity or an executable queue.';
COMMENT ON COLUMN public.openspec_task_source_index_v1.source_ref IS
  'Exact repository-relative tasks.md line locator; source revision is intentionally not represented here.';
COMMENT ON COLUMN public.openspec_task_source_index_v1.canonical_task_key_candidate IS
  'Unadmitted identity proposal from the source census; never an authority key.';
