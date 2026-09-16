-- Adds a whole-file-scoped hash column plus self-describing metadata parameters
-- to codebase_chunk_index, per openspec/changes/parent-atlas-chunk-index-whole-file-hash.
--
-- Background: CURRENT-STRUCTURAL-LINEAGE-01 (owned by
-- parent-atlas-retrieval-lineage-dag-convergence) requires an exact
-- source_ref + content_hash join between codebase_chunk_index and
-- graphify_files / graphify_execution_file_membership_v2, and returns 0
-- matches. Root-caused 2026-09-15 (docs/reports/content-hash-format-heterogeneity-v1.json,
-- docs/reports/codebase-chunk-index-writer-audit-v1.json): codebase_chunk_index's
-- existing content_hash is CHUNK-scoped (truncated to 16 chars for ~39,114 of
-- 55,853 rows, full 64-char for the remainder), while graphify_files/
-- graphify_execution_file_membership_v2.content_hash is WHOLE-FILE-scoped,
-- untruncated SHA-256. The two can never be equal by construction.
--
-- This migration is PURELY ADDITIVE. It does not touch, redefine, or
-- backfill the existing content_hash column, and does not change any
-- existing writer or reader's behavior. Confirmed via a live
-- information_schema.columns query (2026-09-15) that none of the 5 new
-- column names collide with any of the 86 existing columns on this table.
--
-- No backfill is performed here. Existing 55,853 rows get NULL for all 5
-- new columns, matching this repo's "STAGEABLE" convention (see the
-- 20260909_atlas_packets_source_revision.sql migration for the identical
-- precedent on a different table). Backfilling real values requires a
-- separately authorized pass per
-- openspec/changes/parent-atlas-chunk-index-whole-file-hash/tasks.md
-- sections 4-5 (dry-run parity proof, then bounded rollout) -- do not
-- synthesize file_content_hash or metadata values here.
--
-- content_hash_scope/algorithm/length/version describe the EXISTING
-- content_hash column's per-row provenance (populated only once a row's
-- writer is read and confirmed -- see tasks.md task 2.3's classification
-- table); they are not populated by this migration either.

ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS file_content_hash text;
ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS content_hash_scope text;
ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS content_hash_algorithm text;
ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS content_hash_length integer;
ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS content_hash_version integer;

-- Constrain content_hash_scope to the two known values, matching design.md's
-- decision that this column describes ONLY the existing content_hash's
-- known provenance -- never a free-text guess.
-- Note: PostgreSQL has no "ADD CONSTRAINT IF NOT EXISTS" syntax (only ADD
-- COLUMN IF NOT EXISTS and DROP CONSTRAINT IF EXISTS exist) -- caught during
-- the task-3.2 manual review of this file; the idiomatic idempotent form is
-- a guarded DO block against pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'codebase_chunk_index_content_hash_scope_check'
  ) THEN
    ALTER TABLE codebase_chunk_index
      ADD CONSTRAINT codebase_chunk_index_content_hash_scope_check
      CHECK (content_hash_scope IS NULL OR content_hash_scope IN ('chunk', 'whole_file'));
  END IF;
END $$;

-- Partial index for the eventual exact join against graphify_files /
-- graphify_execution_file_membership_v2 (task 6.1, separately authorized).
-- Matches the existing partial-index-on-non-null pattern already used
-- throughout this repo's manual migrations (e.g. idx_atlas_packets_source_revision).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_file_content_hash
  ON codebase_chunk_index (source_ref, file_content_hash)
  WHERE file_content_hash IS NOT NULL;
