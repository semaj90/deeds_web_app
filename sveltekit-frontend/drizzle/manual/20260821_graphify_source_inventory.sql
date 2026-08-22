-- Parent Atlas Graphify source-inventory owner, manual migration.
--
-- This file is intentionally outside the automatic journal. Applying it does
-- not authorize a backfill or Graphify/Qdrant promotion. The writer must
-- preserve legacy Git source_revision and store exact bytes in content_hash;
-- the read-only canary must pass before any row is populated.

-- Additive-only safety gate. A historical graphify_files definition exists in
-- the repository with different columns and constraints. CREATE TABLE IF NOT
-- EXISTS would silently accept that incompatible table and make the writer's
-- lineage contract ambiguous. Stop instead; an operator must reconcile the
-- existing schema in a separately reviewed migration. This migration never
-- drops, deletes, truncates, or rewrites existing rows.
DO $$
BEGIN
  IF to_regclass('public.graphify_files') IS NOT NULL THEN
    RAISE EXCEPTION
      'GRAPHIFY_FILES_ALREADY_EXISTS_REQUIRES_SCHEMA_RECONCILIATION';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS graphify_files (
  file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_revision text NOT NULL,
  source_ref text NOT NULL,
  source_revision text,
  content_hash char(64) NOT NULL,
  byte_length bigint NOT NULL,
  git_blob_oid text,
  source_revision_authority text NOT NULL DEFAULT 'content_hash',
  producer_revision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT graphify_files_content_hash_hex
    CHECK (content_hash ~ '^[0-9a-fA-F]{64}$'),
  CONSTRAINT graphify_files_byte_length_nonnegative
    CHECK (byte_length >= 0),
  CONSTRAINT graphify_files_source_revision_authority_check
    CHECK (source_revision_authority IN ('source_revision', 'content_hash')),
  CONSTRAINT graphify_files_workspace_source_unique
    UNIQUE (workspace_revision, source_ref)
);

CREATE INDEX IF NOT EXISTS graphify_files_workspace_source_idx
  ON graphify_files (workspace_revision, source_ref);

CREATE INDEX IF NOT EXISTS graphify_files_content_hash_idx
  ON graphify_files (content_hash);

CREATE INDEX IF NOT EXISTS graphify_files_source_revision_idx
  ON graphify_files (source_revision)
  WHERE source_revision IS NOT NULL;

COMMENT ON TABLE graphify_files IS
  'Parent Atlas source inventory. Manual migration; rows require exact-byte readback proof before canonical promotion.';
COMMENT ON COLUMN graphify_files.source_revision IS
  'Legacy Git provenance coordinate; never overwrite with a content digest.';
COMMENT ON COLUMN graphify_files.content_hash IS
  'Exact UTF-8 source-byte SHA-256 authority for compatibility layout.';
