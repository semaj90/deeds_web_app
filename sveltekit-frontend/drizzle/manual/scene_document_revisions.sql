-- Candidate only: append-only case scene manifest revisions. Not applied.
-- Rehearse against an isolated PostgreSQL 18 scratch database before approval.
CREATE TABLE IF NOT EXISTS scene_document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  scene_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  command_id uuid NOT NULL UNIQUE,
  parent_manifest_sha256 text CHECK (parent_manifest_sha256 IS NULL OR parent_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
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
  format text NOT NULL CHECK (format IN ('GLB')),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length integer NOT NULL CHECK (byte_length > 0 AND byte_length <= 67108864),
  content_type text NOT NULL CHECK (content_type = 'model/gltf-binary'),
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
