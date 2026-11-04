-- scene_markers anchor fields (PROPOSAL, not applied to live).
-- Additive and nullable: existing rows keep anchor_kind NULL (legacy x/y/z only).
-- New rows should carry an anchor. Application enforcement comes after this rehearsal.
-- Pre-image: scene_markers exists (drizzle/manual/scene_markers.sql); no anchor columns yet.
-- Idempotent: ADD COLUMN IF NOT EXISTS. Constraints are added only if absent.

ALTER TABLE scene_markers ADD COLUMN IF NOT EXISTS source_revision text;
ALTER TABLE scene_markers ADD COLUMN IF NOT EXISTS source_sha256 text;
ALTER TABLE scene_markers ADD COLUMN IF NOT EXISTS anchor_kind text;
ALTER TABLE scene_markers ADD COLUMN IF NOT EXISTS anchor_u double precision;
ALTER TABLE scene_markers ADD COLUMN IF NOT EXISTS anchor_v double precision;
ALTER TABLE scene_markers ADD COLUMN IF NOT EXISTS mesh_id text;
ALTER TABLE scene_markers ADD COLUMN IF NOT EXISTS triangle_index integer;
ALTER TABLE scene_markers ADD COLUMN IF NOT EXISTS barycentric jsonb;
ALTER TABLE scene_markers ADD COLUMN IF NOT EXISTS anchor_status text NOT NULL DEFAULT 'DRAFT';

DO $$ BEGIN
  ALTER TABLE scene_markers ADD CONSTRAINT scene_markers_anchor_kind_check
    CHECK (anchor_kind IS NULL OR anchor_kind IN ('IMAGE_UV', 'MESH_SURFACE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE scene_markers ADD CONSTRAINT scene_markers_image_uv_check
    CHECK (anchor_kind IS DISTINCT FROM 'IMAGE_UV' OR (
      anchor_u IS NOT NULL AND anchor_v IS NOT NULL
      AND anchor_u NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
      AND anchor_v NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
      AND anchor_u BETWEEN 0 AND 1 AND anchor_v BETWEEN 0 AND 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE scene_markers ADD CONSTRAINT scene_markers_mesh_anchor_check
    CHECK (anchor_kind IS DISTINCT FROM 'MESH_SURFACE' OR (
      mesh_id IS NOT NULL AND triangle_index IS NOT NULL AND triangle_index >= 0
      AND barycentric IS NOT NULL AND jsonb_typeof(barycentric) = 'array'
      AND jsonb_array_length(barycentric) = 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE scene_markers ADD CONSTRAINT scene_markers_anchor_status_check
    CHECK (anchor_status IN ('DRAFT', 'PROPOSED', 'REVIEWED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS scene_markers_source_revision_idx
  ON scene_markers (case_id, source_revision) WHERE source_revision IS NOT NULL;
