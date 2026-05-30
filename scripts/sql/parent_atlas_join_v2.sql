-- parent_atlas_join_v2.sql
-- All-lanes parent atlas indexing via DuckDB map-reduce.
-- Joins 8 lane CSVs into a unified parent_atlas table + per-lane summaries.
--
-- Inputs:  .tmp/ingest/lanes/{lane}.csv + .tmp/ingest/edges/{lane}_edges.csv
-- Outputs: .tmp/ingest/parent_atlas_full.parquet
--          .tmp/ingest/cluster_summary.parquet
--          .tmp/ingest/lane_summary.parquet
--
-- Run: duckdb .tmp/ingest/atlas.duckdb -c ".read scripts/sql/parent_atlas_join_v2.sql"

PRAGMA threads=4;

-- ─── Stage 1: Load all lane CSVs into typed tables ───────────────────────

CREATE OR REPLACE TABLE nodes_all AS
SELECT * FROM read_csv_auto(
  '.tmp/ingest/lanes/*.csv',
  HEADER=TRUE,
  DELIM=',',
  QUOTE='"',
  ESCAPE='"',
  NULL_PADDING=TRUE,
  PARALLEL=FALSE,
  MAX_LINE_SIZE=30000000,
  UNION_BY_NAME=TRUE
);

CREATE OR REPLACE TABLE edges_all AS
SELECT * FROM read_csv_auto(
  '.tmp/ingest/edges/*.csv',
  HEADER=TRUE,
  DELIM=',',
  QUOTE='"',
  ESCAPE='"',
  NULL_PADDING=TRUE,
  PARALLEL=FALSE,
  MAX_LINE_SIZE=30000000,
  UNION_BY_NAME=TRUE
);

-- ─── Stage 2: Per-lane summaries ──────────────────────────────────────────

CREATE OR REPLACE TABLE lane_summary AS
SELECT
  lane,
  COUNT(*) AS node_count,
  COUNT(DISTINCT sourceRef) AS unique_sources
FROM nodes_all
GROUP BY lane
ORDER BY node_count DESC;

-- ─── Stage 3: Card lane enrichment (SOM cluster join) ────────────────────

CREATE OR REPLACE TABLE card_enriched AS
SELECT
  n.node_id AS card_id,
  n.title,
  n.sourceRef,
  -- Pull SOM coords from payload_json
  TRY_CAST(json_extract(n.payload_json, '$.som_bmu_row') AS INTEGER) AS som_row,
  TRY_CAST(json_extract(n.payload_json, '$.som_bmu_col') AS INTEGER) AS som_col,
  TRY_CAST(json_extract(n.payload_json, '$.som_bmu_index') AS INTEGER) AS som_index,
  TRY_CAST(json_extract(n.payload_json, '$.reward_avg') AS DOUBLE) AS reward_avg,
  TRY_CAST(json_extract(n.payload_json, '$.reward_count') AS INTEGER) AS reward_count
FROM nodes_all n
WHERE n.lane = 'card';

-- ─── Stage 4: Cluster summary (SOM cluster heat) ─────────────────────────

CREATE OR REPLACE TABLE cluster_summary AS
SELECT
  som_row,
  som_col,
  COUNT(*) AS card_count,
  AVG(reward_avg) AS avg_reward,
  SUM(reward_count) AS total_outcomes,
  COUNT(CASE WHEN reward_count > 0 THEN 1 END) AS cards_with_rewards
FROM card_enriched
WHERE som_row IS NOT NULL
GROUP BY som_row, som_col;

-- ─── Stage 5: Edge degree (neighbor count per node) ──────────────────────

CREATE OR REPLACE TABLE node_degree AS
SELECT
  from_node_id AS node_id,
  COUNT(*) AS out_degree
FROM edges_all
GROUP BY from_node_id
UNION ALL
SELECT
  to_node_id AS node_id,
  COUNT(*) AS in_degree
FROM edges_all
GROUP BY to_node_id;

CREATE OR REPLACE TABLE node_degree_agg AS
SELECT
  node_id,
  SUM(out_degree) AS total_degree
FROM node_degree
GROUP BY node_id;

-- ─── Stage 6: Parent atlas (unified node view with enrichment) ───────────

CREATE OR REPLACE TABLE parent_atlas_full AS
SELECT
  n.lane,
  n.node_id,
  n.title,
  n.sourceRef,
  COALESCE(d.total_degree, 0) AS degree,
  -- Card-specific fields (NULL for non-card lanes)
  c.som_row,
  c.som_col,
  c.som_index,
  c.reward_avg,
  c.reward_count,
  -- Cluster context for cards
  cs.card_count AS cluster_size,
  cs.avg_reward AS cluster_avg_reward,
  n.payload_json
FROM nodes_all n
LEFT JOIN node_degree_agg d ON n.node_id = d.node_id
LEFT JOIN card_enriched c   ON n.node_id = c.card_id
LEFT JOIN cluster_summary cs ON c.som_row = cs.som_row AND c.som_col = cs.som_col;

-- ─── Stage 7: Export to Parquet ──────────────────────────────────────────

COPY (SELECT * FROM parent_atlas_full)
  TO '.tmp/ingest/parent_atlas_full.parquet' (FORMAT PARQUET);

COPY (SELECT * FROM cluster_summary)
  TO '.tmp/ingest/cluster_summary.parquet' (FORMAT PARQUET);

COPY (SELECT * FROM lane_summary)
  TO '.tmp/ingest/lane_summary.parquet' (FORMAT PARQUET);

COPY (SELECT * FROM edges_all)
  TO '.tmp/ingest/edges_all.parquet' (FORMAT PARQUET);

-- ─── Stage 8: Print summary ──────────────────────────────────────────────

SELECT '=== Lane Summary ===' AS section;
SELECT * FROM lane_summary;

SELECT '=== Cluster Summary (top 10) ===' AS section;
SELECT * FROM cluster_summary ORDER BY card_count DESC LIMIT 10;

SELECT '=== Parent Atlas Stats ===' AS section;
SELECT
  COUNT(*) AS total_nodes,
  COUNT(DISTINCT lane) AS lanes,
  SUM(degree) AS total_degree,
  COUNT(CASE WHEN reward_avg IS NOT NULL THEN 1 END) AS reward_enriched,
  COUNT(CASE WHEN som_row IS NOT NULL THEN 1 END) AS som_assigned
FROM parent_atlas_full;
