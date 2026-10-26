-- DRAFT — NOT APPLIED. For review only.
-- Purpose: atlas.packet_search filters on lower(source_ref) = ANY(...) and on LIKE prefixes.
-- Existing btree indexes on source_ref cannot serve these predicates, so each lookup scans all
-- ~61.7k atlas_packets rows (EXPLAIN 2026-10-13: seq scan, ~260 ms cold), which intermittently
-- exceeds the tool's statement timeout (cause of the packet_search tool errors).
-- Target: PostgreSQL 18.4, legal_ai_db. Additive indexes only; no data change.
-- Note: plain CREATE INDEX takes a SHARE lock (blocks writes to atlas_packets) for the build.
-- For a production-style apply without the lock, run each CREATE INDEX CONCURRENTLY outside a
-- transaction instead; this draft uses the transactional form so it can be rehearsed and rolled back.

BEGIN;

CREATE INDEX IF NOT EXISTS atlas_packets_source_ref_lower_pattern_idx
  ON atlas_packets (lower(source_ref) text_pattern_ops);

CREATE INDEX IF NOT EXISTS atlas_packets_source_ref_pattern_idx
  ON atlas_packets (source_ref text_pattern_ops);

COMMIT;

-- Rollback (owner decision only):
--   DROP INDEX IF EXISTS atlas_packets_source_ref_lower_pattern_idx, atlas_packets_source_ref_pattern_idx;
