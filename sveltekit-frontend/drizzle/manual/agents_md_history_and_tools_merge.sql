-- ─────────────────────────────────────────────────────────────────────────────
-- Non-destructive AGENTS.md tools merge.
--
-- Flow:
--   1. Create history snapshot table if missing (audit log of every envelope)
--   2. Snapshot every current agent_context_files row WITH timestamp +
--      content_hash mapping (so we never lose data)
--   3. Merge canonical MCP tool list into rows where tools is empty/null —
--      UPDATE only, no DELETE, no overwrite of populated tools arrays
--   4. Report counts
--
-- Idempotent: re-running adds another snapshot row (history grows) but the
--             merge is a no-op once tools are populated.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. History/audit table — never deleted from
CREATE TABLE IF NOT EXISTS agent_context_files_history (
  id              bigserial PRIMARY KEY,
  -- Map back to the source row identity
  source_id       uuid NOT NULL,
  stable_key      text NOT NULL,
  file_path       text NOT NULL,
  -- Snapshot of the envelope at this moment
  content_hash    text,
  title           text,
  summary         text,
  rules           jsonb,
  tools           jsonb,
  constraints     jsonb,
  semantic_tags   text[],
  qdrant_tags     text[],
  confidence      real,
  schema_version  integer,
  -- Snapshot metadata
  snapshot_reason text NOT NULL DEFAULT 'pre-merge',
  snapshot_at     timestamptz NOT NULL DEFAULT now(),
  -- Reference to the chunk_hit_log identity if applicable (for cross-table lineage)
  chunk_id        text
);

CREATE INDEX IF NOT EXISTS agent_context_files_history_stable_key_idx
  ON agent_context_files_history (stable_key, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS agent_context_files_history_source_id_idx
  ON agent_context_files_history (source_id);
CREATE INDEX IF NOT EXISTS agent_context_files_history_snapshot_at_idx
  ON agent_context_files_history (snapshot_at DESC);

-- 2. Snapshot current state BEFORE any changes
INSERT INTO agent_context_files_history (
  source_id, stable_key, file_path,
  content_hash, title, summary,
  rules, tools, constraints, semantic_tags, qdrant_tags,
  confidence, schema_version,
  snapshot_reason, chunk_id
)
SELECT
  id, stable_key, file_path,
  content_hash, title, summary,
  rules, tools, constraints, semantic_tags, qdrant_tags,
  confidence, schema_version,
  'pre-tools-merge-2026-05-08',
  -- Lineage hint: stable_key already encodes the file identity, but if any
  -- chunk_hit_log row references the same file, we can join later.
  stable_key
FROM agent_context_files;

-- Report snapshot count
DO $$
DECLARE
  snap_count int;
BEGIN
  SELECT count(*) INTO snap_count
    FROM agent_context_files_history
    WHERE snapshot_reason = 'pre-tools-merge-2026-05-08'
      AND snapshot_at >= now() - interval '5 seconds';
  RAISE NOTICE 'Snapshot rows inserted: %', snap_count;
END $$;

-- 3. Merge canonical MCP tool list into rows where tools is empty.
-- Tool list mirrors generate-agents-md.mjs (static for now, derived from
-- TRACE MCP tools/list later via P0.4). UPDATE only — never overwrites
-- populated tools arrays.
WITH canonical_tools AS (
  SELECT '[
    {"tool":"kag.multi_lane_search",     "allowed":true, "scope":"unspecified"},
    {"tool":"graph.expand_neighborhood",  "allowed":true, "scope":"unspecified"},
    {"tool":"topology.same_som_cluster",  "allowed":true, "scope":"unspecified"},
    {"tool":"clusters.get_members",       "allowed":true, "scope":"unspecified"},
    {"tool":"context.build_kv_packet",    "allowed":true, "scope":"unspecified"},
    {"tool":"taxonomy.children",          "allowed":true, "scope":"unspecified"},
    {"tool":"trace.kag_search",           "allowed":true, "scope":"unspecified"},
    {"tool":"search.hybrid",              "allowed":true, "scope":"unspecified"}
  ]'::jsonb AS payload
)
UPDATE agent_context_files acf
   SET tools      = (SELECT payload FROM canonical_tools),
       updated_at = now()
  WHERE jsonb_typeof(tools) IS DISTINCT FROM 'array'
     OR jsonb_array_length(tools) = 0;

-- Report merge count
DO $$
DECLARE
  merged_count int;
BEGIN
  SELECT count(*) INTO merged_count
    FROM agent_context_files
    WHERE jsonb_typeof(tools) = 'array'
      AND jsonb_array_length(tools) > 0
      AND updated_at >= now() - interval '5 seconds';
  RAISE NOTICE 'Tools merged into rows: %', merged_count;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification (read-only — separate from the transaction)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'agent_context_files'         AS tbl,
  count(*) FILTER (WHERE jsonb_typeof(rules)       = 'array' AND jsonb_array_length(rules)       > 0) AS w_rules,
  count(*) FILTER (WHERE jsonb_typeof(tools)       = 'array' AND jsonb_array_length(tools)       > 0) AS w_tools,
  count(*) FILTER (WHERE jsonb_typeof(constraints) = 'array' AND jsonb_array_length(constraints) > 0) AS w_constraints,
  count(*) FILTER (WHERE length(coalesce(summary,''))>50)                                              AS w_summary,
  count(*)                                                                                            AS total
FROM agent_context_files
UNION ALL
SELECT
  'agent_context_files_history',
  count(*) FILTER (WHERE snapshot_reason LIKE 'pre-tools-merge%'),
  count(*) FILTER (WHERE jsonb_typeof(tools) = 'array' AND jsonb_array_length(tools) > 0),
  NULL, NULL,
  count(*)
FROM agent_context_files_history;
