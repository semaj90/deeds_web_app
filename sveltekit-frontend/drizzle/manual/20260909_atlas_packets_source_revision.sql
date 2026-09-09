-- Adds atlas_packets.source_revision, closing the schema/DB drift found
-- 2026-09-08 by PACKET_WRITE_REVISION_CONTRACT_01: the Drizzle schema file
-- (src/lib/server/db/schema/atlas-packets.ts:76) has declared this column
-- since before this session, but a live information_schema.columns query
-- confirmed it was never actually migrated in. Operator decision 2026-09-09:
-- migrate (add the column) rather than redefine revision-qualification onto
-- workspace_revision + content_hash.
--
-- Purely additive: nullable text column, no default, no backfill performed
-- here. Existing 61,718 rows get NULL, matching this repo's own documented
-- "STAGEABLE -- source_ref, source_revision, and workspace_revision may
-- remain null" convention (docs/parent-atlas-workstation-todo.md). Backfilling
-- real revision values requires resolving CURRENT-SOURCE-OWNER-RECONCILIATION-01
-- first (a separate, still-open gate) -- do not synthesize revision values
-- here to make rows look qualified.
--
-- The partial index below already exists as a declared intent in the Drizzle
-- schema (sourceRevisionIdx, same file) -- created here so schema and live DB
-- agree, matching the pattern of every other revision index on this table.

ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS source_revision text;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_source_revision
  ON atlas_packets (source_revision)
  WHERE source_revision IS NOT NULL;
