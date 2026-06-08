-- semantic-cache-candidates.sql
-- DuckDB MapReduce join: nes-chrom-packets + glyph-rewards + token-map
-- Output: memory/packets/semantic-cache-candidates.jsonl
--
-- Usage:
--   duckdb memory/packets/packets.duckdb -c ".read scripts/packets/semantic-cache-candidates.sql"

-- Ensure tables are loaded (idempotent via CREATE OR REPLACE)
CREATE OR REPLACE TABLE raw_packets AS
  SELECT * FROM read_ndjson_auto('memory/packets/nes-chrom-packets.jsonl', ignore_errors := true);

CREATE OR REPLACE TABLE raw_rewards AS
  SELECT * FROM read_ndjson_auto('memory/packets/atlas-glyph-rewards.jsonl', ignore_errors := true);

CREATE OR REPLACE TABLE raw_facts AS
  SELECT * FROM read_ndjson_auto('memory/packets/atlas-packet-facts.jsonl', ignore_errors := true);

-- token-map may be empty; provide fallback schema
CREATE OR REPLACE TABLE raw_token_map AS
  SELECT
    NULL::VARCHAR AS feature_id,
    NULL::VARCHAR AS token_hint
  WHERE FALSE;

CREATE OR REPLACE TABLE raw_edges AS
  SELECT * FROM read_ndjson_auto('memory/packets/atlas-graph-edges.jsonl', ignore_errors := true);

-- Aggregate reward per (query_hash, feature_id) — best reward wins
CREATE OR REPLACE TABLE agg_rewards AS
  SELECT
    r.query_hash,
    r.feature_id,
    MAX(CAST(r.reward AS DOUBLE)) AS reward,
    COUNT(*) AS reward_samples
  FROM raw_rewards r
  GROUP BY r.query_hash, r.feature_id;

-- Aggregate facts: prompt context by packet_uuid
CREATE OR REPLACE TABLE agg_facts AS
  SELECT
    f.packet_uuid,
    LIST(f.fact_value ORDER BY f.score DESC)[1] AS answer_hint,
    MAX(CAST(f.score AS DOUBLE)) AS confidence
  FROM raw_facts f
  WHERE f.fact_type IN ('summary', 'prompt_context', 'answer')
  GROUP BY f.packet_uuid;

-- Token hints per feature_id
CREATE OR REPLACE TABLE agg_tokens AS
  SELECT
    t.feature_id,
    LIST(DISTINCT t.token_hint) AS token_hints
  FROM raw_token_map t
  GROUP BY t.feature_id;

-- Source ref confidence from edges (schema: packet_uuid, src, dst, edge_type, weight, metadata)
CREATE OR REPLACE TABLE agg_source_refs AS
  SELECT
    e.packet_uuid,
    LIST(DISTINCT e.dst) AS source_refs,
    COUNT(DISTINCT e.dst) AS source_ref_count
  FROM raw_edges e
  WHERE e.edge_type IN ('SOURCE_REF', 'DERIVED_FROM', 'REFERENCES')
  GROUP BY e.packet_uuid;

-- Final join — produce semantic cache candidates
COPY (
  SELECT
    CONCAT('bifrost:sem:packet:', p.query_hash) AS cache_key,
    p.query_hash,
    COALESCE(p.feature_id, 'unknown') AS feature_id,
    p.packet_id AS packet_uuid,
    COALESCE(sr.source_refs, []) AS source_refs,
    COALESCE(p.route, '') AS prompt,
    COALESCE(af.answer_hint, '') AS answer_hint,
    COALESCE(ar.reward, CAST(p.reward AS DOUBLE), 0.0) AS reward,
    COALESCE(af.confidence, 0.7) AS confidence,
    COALESCE(tk.token_hints, []) AS token_hints,
    COALESCE(TRY_CAST(p.som_cluster AS INTEGER), -1) AS som_cluster,
    COALESCE(p.cache_tier, 'unknown') AS cache_tier,
    p.captured_at
  FROM raw_packets p
  LEFT JOIN agg_rewards ar
    ON ar.query_hash = p.query_hash AND ar.feature_id = p.feature_id
  LEFT JOIN agg_facts af
    ON af.packet_uuid = p.packet_id
  LEFT JOIN agg_tokens tk
    ON tk.feature_id = p.feature_id
  LEFT JOIN agg_source_refs sr
    ON sr.packet_uuid = p.packet_id
  WHERE COALESCE(ar.reward, CAST(p.reward AS DOUBLE), 0.0) > 0
  ORDER BY reward DESC
  LIMIT 5000
) TO 'memory/packets/semantic-cache-candidates.jsonl'
(FORMAT JSON, ARRAY false);

SELECT
  COUNT(*) AS candidates,
  AVG(CAST(reward AS DOUBLE)) AS avg_reward,
  COUNT(DISTINCT feature_id) AS features,
  COUNT(DISTINCT query_hash) AS unique_queries
FROM (
  SELECT
    p.feature_id,
    p.query_hash,
    COALESCE(ar.reward, TRY_CAST(p.reward AS DOUBLE), 0.0) AS reward
  FROM raw_packets p
  LEFT JOIN agg_rewards ar ON ar.query_hash = p.query_hash AND ar.feature_id = p.feature_id
  WHERE COALESCE(ar.reward, TRY_CAST(p.reward AS DOUBLE), 0.0) > 0
) sub;
