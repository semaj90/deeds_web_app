-- Candidate only: append-only case scene manifest revisions. Not applied.
-- Rehearse against an isolated PostgreSQL 18 scratch database before approval.
CREATE TABLE IF NOT EXISTS scene_document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  scene_id uuid NOT NULL,
  revision integer NOT NULL CONSTRAINT scene_document_revisions_revision_check CHECK (revision >= 1),
  command_id uuid NOT NULL CONSTRAINT scene_document_revisions_command_uq UNIQUE,
  parent_manifest_sha256 text CONSTRAINT scene_document_revisions_parent_sha_check CHECK (parent_manifest_sha256 IS NULL OR parent_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text NOT NULL CONSTRAINT scene_document_revisions_manifest_sha_check CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest jsonb NOT NULL,
  created_by integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scene_document_revisions_case_scene_revision_uq UNIQUE (case_id, scene_id, revision)
);
CREATE INDEX IF NOT EXISTS scene_document_revisions_head_idx
  ON scene_document_revisions (case_id, scene_id, revision DESC);

CREATE OR REPLACE FUNCTION reject_scene_document_revision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'scene_document_revisions is append-only';
END;
$$;
DROP TRIGGER IF EXISTS scene_document_revisions_immutable_trg ON scene_document_revisions;
CREATE TRIGGER scene_document_revisions_immutable_trg
  BEFORE UPDATE OR DELETE ON scene_document_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_scene_document_revision_mutation();

-- Case-scoped derived scene bytes use the configured artifact bucket, never
-- legal-evidence or the codebase atlas_artifacts packet registry. Upload is disabled until this
-- candidate DDL has been rehearsed and SCENE_PERSISTENCE_ENABLED is enabled.
CREATE TABLE IF NOT EXISTS scene_assets (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  scene_id uuid NOT NULL,
  format text NOT NULL CONSTRAINT scene_assets_format_ck CHECK (format IN ('GLB', 'SOG')),
  sha256 text NOT NULL CONSTRAINT scene_assets_sha256_ck CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length integer NOT NULL CONSTRAINT scene_assets_byte_length_ck CHECK (byte_length > 0 AND byte_length <= 67108864),
  content_type text NOT NULL CONSTRAINT scene_assets_content_type_ck CHECK (
    (format = 'GLB' AND content_type = 'model/gltf-binary') OR
    (format = 'SOG' AND content_type = 'application/vnd.parent-atlas.streamed-sog+json')
  ),
  bucket text NOT NULL,
  object_key text NOT NULL,
  created_by integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scene_assets_case_scene_sha_uq UNIQUE (case_id, scene_id, sha256),
  CONSTRAINT scene_assets_bucket_object_key_uq UNIQUE (bucket, object_key)
);
CREATE INDEX IF NOT EXISTS scene_assets_case_scene_idx ON scene_assets(case_id, scene_id);

CREATE OR REPLACE FUNCTION reject_scene_asset_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'scene_assets is immutable';
END;
$$;
DROP TRIGGER IF EXISTS scene_assets_immutable_trg ON scene_assets;
CREATE TRIGGER scene_assets_immutable_trg
  BEFORE UPDATE OR DELETE ON scene_assets
  FOR EACH ROW EXECUTE FUNCTION reject_scene_asset_mutation();

-- Streamed SOG consists of an index plus immutable JSON/WebP package members.
-- The package root remains in scene_assets; each member is independently
-- content-addressed in the artifact bucket and read back before registration.
CREATE TABLE IF NOT EXISTS scene_asset_files (
  asset_id uuid NOT NULL REFERENCES scene_assets(asset_id) ON DELETE RESTRICT,
  relative_path text NOT NULL CONSTRAINT scene_asset_files_path_ck CHECK (
    relative_path ~ '^[A-Za-z0-9._/-]+$' AND
    relative_path !~ '(^/|(^|/)\.\.?(/|$)|//|\\)'
  ),
  sha256 text NOT NULL CONSTRAINT scene_asset_files_sha_ck CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length integer NOT NULL CONSTRAINT scene_asset_files_size_ck CHECK (byte_length > 0 AND byte_length <= 67108864),
  content_type text NOT NULL CONSTRAINT scene_asset_files_content_type_ck CHECK (content_type IN ('application/json', 'image/webp')),
  bucket text NOT NULL,
  object_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scene_asset_files_asset_path_uq UNIQUE (asset_id, relative_path),
  CONSTRAINT scene_asset_files_bucket_key_uq UNIQUE (bucket, object_key)
);
CREATE INDEX IF NOT EXISTS scene_asset_files_asset_idx ON scene_asset_files(asset_id);

DROP TRIGGER IF EXISTS scene_asset_files_immutable_trg ON scene_asset_files;
CREATE TRIGGER scene_asset_files_immutable_trg
  BEFORE UPDATE OR DELETE ON scene_asset_files
  FOR EACH ROW EXECUTE FUNCTION reject_scene_asset_mutation();
