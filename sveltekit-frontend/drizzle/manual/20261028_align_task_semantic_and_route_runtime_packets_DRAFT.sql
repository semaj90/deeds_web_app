-- APPLIED to live legal_ai_db (PostgreSQL 18.4) 2026-10-28 by operator authorization (additive DDL only): task_semantic_packets 39->55, route_runtime_packets 40->51 columns; rows 2 and 11 unchanged. Pre-image: .tmp/atlas/preimage-task-route-packets-schema-20261028.sql (sha256 b75dbec3e347827163401a59d0d81bae84af8fe701e980e90b75d0fb7b2b2d2a). Filename keeps DRAFT because other docs reference it.
-- DRAFT, NOT APPLIED. Additive alignment of two live tables to their declared Drizzle schemas. Do not apply without explicit operator approval.
--
-- Pre-image (read-only audit 2026-10-28, `npm run audit:drizzle`, live legal_ai_db PostgreSQL 18):
--   task_semantic_packets  (2 rows):  live has 39 columns; Drizzle (schema/tasks.ts) declares 48; these 16 declared columns are absent live:
--     canonical, canonical_source_ref, community_confidence, community_id, community_source, domain_class, kmeans_cluster, ledger_type,
--     lineage_version, payload_backfilled_at, som_col, som_index, som_row, source_ref_hash, summary, tags
--   route_runtime_packets  (11 rows): live has 40 columns; Drizzle (schema/route_runtime_packets.ts) declares 51; these 11 are absent live:
--     feature_id, git_diff_rank, git_sha, prompt_hash, repair_method, repair_reason, reward, route_state, superseded_by,
--     supersedes_packet_uuid, tree_node_id
--   Live-only columns (7 on task_semantic_packets) are NOT touched: nothing is dropped, renamed or retyped.
-- Why: a Drizzle insert/update that names a declared-but-absent column fails with "column ... does not exist".
-- Safety: every statement is ADD COLUMN IF NOT EXISTS; all new columns are nullable except `canonical` and `tags`, which carry constant defaults
--   (metadata-only on PG 18, no table rewrite). No index is created (existing rows are tiny; indexes are a separate decision).
--   tree_node_id carries the declared FK to atlas_tree_nodes(node_id) ON DELETE SET NULL (column is NULL for all existing rows).
--
-- Rollback (operator-run only, not part of this file's execution): ALTER TABLE ... DROP COLUMN IF EXISTS <each column listed above> on the two tables.
--   Safe only while no writer has populated them.
-- Post-check: SELECT count(*) FROM information_schema.columns WHERE table_name = 'task_semantic_packets';  -- expect 55 (39 + 16)
--             SELECT count(*) FROM information_schema.columns WHERE table_name = 'route_runtime_packets';  -- expect 51 (40 + 11)
--             then rerun `npm run audit:drizzle` and expect both tables to report no onlyInA columns.

BEGIN;

ALTER TABLE task_semantic_packets
  ADD COLUMN IF NOT EXISTS canonical             boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canonical_source_ref  text,
  ADD COLUMN IF NOT EXISTS community_confidence  numeric,
  ADD COLUMN IF NOT EXISTS community_id          integer,
  ADD COLUMN IF NOT EXISTS community_source      text,
  ADD COLUMN IF NOT EXISTS domain_class          text,
  ADD COLUMN IF NOT EXISTS kmeans_cluster        integer,
  ADD COLUMN IF NOT EXISTS ledger_type           text,
  ADD COLUMN IF NOT EXISTS lineage_version       text,
  ADD COLUMN IF NOT EXISTS payload_backfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS som_col               integer,
  ADD COLUMN IF NOT EXISTS som_index             integer,
  ADD COLUMN IF NOT EXISTS som_row               integer,
  ADD COLUMN IF NOT EXISTS source_ref_hash       text,
  ADD COLUMN IF NOT EXISTS summary               text,
  ADD COLUMN IF NOT EXISTS tags                  jsonb       NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE route_runtime_packets
  ADD COLUMN IF NOT EXISTS feature_id             text,
  ADD COLUMN IF NOT EXISTS git_diff_rank          numeric,
  ADD COLUMN IF NOT EXISTS git_sha                text,
  ADD COLUMN IF NOT EXISTS prompt_hash            text,
  ADD COLUMN IF NOT EXISTS repair_method          text,
  ADD COLUMN IF NOT EXISTS repair_reason          text,
  ADD COLUMN IF NOT EXISTS reward                 numeric,
  ADD COLUMN IF NOT EXISTS route_state            text,
  ADD COLUMN IF NOT EXISTS superseded_by          uuid,
  ADD COLUMN IF NOT EXISTS supersedes_packet_uuid uuid,
  ADD COLUMN IF NOT EXISTS tree_node_id           uuid REFERENCES atlas_tree_nodes (node_id) ON DELETE SET NULL;

COMMIT;
