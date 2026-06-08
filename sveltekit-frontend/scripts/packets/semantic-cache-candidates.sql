-- semantic-cache-candidates.sql
-- DuckDB MapReduce join: outcome-ledger + enriched-candidates → semantic-cache-candidates.jsonl
--
-- Run:
--   duckdb -c ".read scripts/packets/semantic-cache-candidates.sql"
--
-- Output: memory/packets/semantic-cache-candidates.jsonl

-- ── Load source tables ────────────────────────────────────────────────────────

CREATE OR REPLACE TABLE outcome_ledger AS
SELECT * FROM read_ndjson_auto(
  '../.opencode/outcome-ledger-with-cardIds.ndjson',
  ignore_errors := true
);

CREATE OR REPLACE TABLE enriched_candidates AS
SELECT * FROM read_ndjson_auto(
  '../.opencode/ndjson/enriched-candidates.ndjson',
  ignore_errors := true
);

CREATE OR REPLACE TABLE cluster_summaries AS
SELECT * FROM read_ndjson_auto(
  '../.opencode/ndjson/cluster-summary.ndjson',
  ignore_errors := true
);

-- ── Aggregate rewards by intent + primary sourceRef ───────────────────────────

CREATE OR REPLACE TABLE reward_agg AS
SELECT
  intent,
  tool,
  sourceRefs[1]                                    AS primary_source_ref,
  COUNT(*)                                         AS outcome_count,
  ROUND(AVG(reward), 4)                            AS avg_reward,
  ROUND(MAX(reward), 4)                            AS max_reward,
  ROUND(SUM(CASE WHEN recommendationAccepted THEN reward ELSE 0 END)
        / NULLIF(COUNT(*), 0), 4)                  AS acceptance_weighted_reward,
  COUNT(*) FILTER (WHERE recommendationAccepted)   AS accepted_count,
  MAX(timestamp)                                   AS latest_timestamp
FROM outcome_ledger
WHERE sourceRefs IS NOT NULL AND len(sourceRefs) > 0
GROUP BY intent, tool, sourceRefs[1]
HAVING AVG(reward) >= 0.5
ORDER BY avg_reward DESC;

-- ── Join with enriched candidates for SOM + summary context ──────────────────

CREATE OR REPLACE TABLE joined AS
SELECT
  md5(CONCAT(r.intent, ':', r.primary_source_ref)) AS query_hash,
  CONCAT('bifrost:sem:packet:', md5(CONCAT(r.intent, ':', r.primary_source_ref))) AS cache_key,
  -- extract feature_id from card_id (strip 'file:' prefix)
  REPLACE(COALESCE(ec.card_id, r.primary_source_ref), 'file:', '') AS feature_id,
  r.intent                                         AS prompt,
  r.tool                                           AS answer_hint,
  r.primary_source_ref,
  r.outcome_count,
  r.avg_reward                                     AS reward,
  r.acceptance_weighted_reward                     AS confidence,
  r.accepted_count,
  r.latest_timestamp,
  COALESCE(ec.summary, '')                         AS summary,
  ec.som_row,
  ec.som_col,
  ec.tags
FROM reward_agg r
LEFT JOIN enriched_candidates ec
  ON ec.card_id = CONCAT('file:', r.primary_source_ref)
   OR ec.card_id = r.primary_source_ref
ORDER BY r.avg_reward DESC;

-- ── Write output ──────────────────────────────────────────────────────────────

COPY (
  SELECT
    cache_key,
    query_hash,
    feature_id,
    -- sourceRefs as JSON array
    json_array(primary_source_ref)                 AS source_refs,
    prompt,
    answer_hint,
    COALESCE(summary, '')                          AS context_summary,
    reward,
    ROUND(COALESCE(confidence, reward * 0.9), 4)  AS confidence,
    outcome_count,
    accepted_count,
    som_row,
    som_col,
    latest_timestamp
  FROM joined
  WHERE reward >= 0.6
)
TO '../memory/packets/semantic-cache-candidates.jsonl'
(FORMAT JSON, ARRAY false);

-- Summary
SELECT
  COUNT(*)                  AS total_candidates,
  ROUND(AVG(reward), 4)     AS avg_reward,
  ROUND(MIN(reward), 4)     AS min_reward,
  COUNT(*) FILTER (WHERE confidence >= 0.85) AS high_confidence,
  COUNT(*) FILTER (WHERE som_row IS NOT NULL) AS with_som_coords
FROM joined
WHERE reward >= 0.6;
