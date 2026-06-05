-- offline-parent-atlas-mapreduce.sql
--
-- Offline cold-processing MapReduce for Parent Atlas.
-- Run with:
--   duckdb .tmp/offline-synthesis-mapreduce.duckdb < scripts/atlas/offline-parent-atlas-mapreduce.sql
--
-- Requires DuckDB postgres extension and a reachable Postgres instance.
-- Connection: host=127.0.0.1 port=5434 dbname=legal_ai_db user=legal_admin password=123456

INSTALL postgres;
LOAD postgres;

-- Attach live Postgres as read-only source
ATTACH 'host=127.0.0.1 port=5434 dbname=legal_ai_db user=legal_admin password=123456' AS pg_db (TYPE postgres, READ_ONLY);

-- ── 1. cold_parent_atlas_cards ────────────────────────────────────────────────
-- Canonical file cards from parent_atlas_documents.
-- Excludes: feature:* refs, cache dirs, build dirs, venv, node_modules.

CREATE OR REPLACE TABLE cold_parent_atlas_cards AS
SELECT
  pad.id,
  pad.source_ref,
  pad.source_ref            AS source_id,
  pad.rel_path,
  pad.rel_path              AS file_path,
  pad.feature_id,
  pad.related_feature_ids,
  pad.workspace_id,
  pad.file_ext,
  pad.tags,
  pad.line_count,
  pad.is_route,
  pad.is_svelte_comp,
  pad.has_auth,
  pad.has_zod,
  pad.drizzle_refs,
  pad.imports,
  pad.exports,
  pad.route_handlers,
  pad.cluster_id,
  pad.centroid_id,
  pad.qdrant_point_id,
  pad.alias_id,
  pad.ingest_source,
  pad.created_at,
  pad.updated_at,
  -- enrichment from atlas_feature_map
  afm.som_cluster,
  afm.neo4j_node_id,
  afm.nes_card_id,
  afm.lane_ids,
  afm.atlas_version,
  afm.indexed_at            AS afm_indexed_at,
  -- source classification
  CASE
    WHEN pad.is_route        THEN 'route'
    WHEN pad.is_svelte_comp  THEN 'component'
    WHEN pad.file_ext IN ('ts','js','mjs','cjs') THEN 'typescript'
    WHEN pad.file_ext = 'sql' THEN 'schema'
    ELSE COALESCE(pad.file_ext, 'file')
  END                       AS source_kind,
  true                      AS cold_storage_ready
FROM pg_db.parent_atlas_documents pad
LEFT JOIN pg_db.atlas_feature_map afm ON afm.source_ref = pad.source_ref
WHERE pad.source_ref NOT LIKE 'feature:%'
  AND pad.rel_path NOT LIKE '.cache/%'
  AND pad.rel_path NOT LIKE '.svelte-kit/%'
  AND pad.rel_path NOT LIKE '.vite/%'
  AND pad.rel_path NOT LIKE 'node_modules/%'
  AND pad.rel_path NOT LIKE '%/node_modules/%'
  AND pad.rel_path NOT LIKE '.venv/%'
  AND pad.rel_path NOT LIKE '%/.venv/%'
  AND pad.rel_path NOT LIKE 'models/%'
  AND pad.rel_path NOT LIKE 'dist/%'
  AND pad.rel_path NOT LIKE 'build/%';

SELECT 'cold_parent_atlas_cards' AS tbl, COUNT(*) AS rows FROM cold_parent_atlas_cards;

-- ── 2. cold_feature_rollups ───────────────────────────────────────────────────
-- Feature-level aggregation keyed by feature_id.

CREATE OR REPLACE TABLE cold_feature_rollups AS
SELECT
  afs.feature_id,
  afs.packet_count,
  afs.atlas_file_count,
  afs.qdrant_point_count,
  afs.avg_confidence,
  afs.max_confidence,
  afs.semantic_confidence,
  afs.behavior_score,
  afs.primary_cluster_id,
  afs.primary_centroid_id,
  afs.cluster_ids,
  afs.top_file_paths,
  afs.source_refs,
  afs.synthesized_summary,
  afs.next_actions,
  afs.dominant_status,
  afs.has_blocked,
  afs.atlas_version,
  afs.synthesized_at,
  afs.updated_at,
  -- count from cold_parent_atlas_cards for cross-validation
  COUNT(c.source_ref)        AS pad_file_count,
  COUNT(CASE WHEN c.qdrant_point_id IS NOT NULL THEN 1 END) AS pad_qdrant_count,
  COUNT(CASE WHEN c.centroid_id IS NOT NULL THEN 1 END)     AS pad_centroid_count
FROM pg_db.atlas_feature_synthesis afs
LEFT JOIN cold_parent_atlas_cards c ON c.feature_id = afs.feature_id
GROUP BY
  afs.feature_id, afs.packet_count, afs.atlas_file_count, afs.qdrant_point_count,
  afs.avg_confidence, afs.max_confidence, afs.semantic_confidence, afs.behavior_score,
  afs.primary_cluster_id, afs.primary_centroid_id, afs.cluster_ids, afs.top_file_paths,
  afs.source_refs, afs.synthesized_summary, afs.next_actions, afs.dominant_status,
  afs.has_blocked, afs.atlas_version, afs.synthesized_at, afs.updated_at;

SELECT 'cold_feature_rollups' AS tbl, COUNT(*) AS rows FROM cold_feature_rollups;

-- ── 3. cold_source_ref_rollups ────────────────────────────────────────────────
-- Per-source-ref synthesis rollup (karpathy blend + Qdrant + cluster).

CREATE OR REPLACE TABLE cold_source_ref_rollups AS
SELECT
  asrs.source_ref,
  asrs.source_kind,
  asrs.feature_id,
  asrs.atlas_rank,
  asrs.atlas_authority,
  asrs.karpathy_blend,
  asrs.pagerank_score,
  asrs.attention_score,
  asrs.qdrant_point_ids,
  asrs.cluster_ids,
  asrs.som_cluster,
  asrs.synthesized_summary,
  asrs.synthesized_at,
  asrs.updated_at,
  -- join back to cold_parent_atlas_cards for enriched context
  c.rel_path,
  c.file_path,
  c.centroid_id,
  c.qdrant_point_id,
  c.line_count,
  c.is_route,
  c.is_svelte_comp,
  c.cold_storage_ready
FROM pg_db.atlas_source_ref_synthesis asrs
LEFT JOIN cold_parent_atlas_cards c ON c.source_ref = asrs.source_ref
WHERE asrs.source_ref NOT LIKE 'feature:%';

SELECT 'cold_source_ref_rollups' AS tbl, COUNT(*) AS rows FROM cold_source_ref_rollups;

-- ── 4. cold_profile_card_candidates ──────────────────────────────────────────
-- Files ready for profile-card generation: has qdrant_point_id or centroid_id,
-- is a real source file, ordered by line_count descending (most complex first).

CREATE OR REPLACE TABLE cold_profile_card_candidates AS
SELECT
  c.source_ref,
  c.source_id,
  c.rel_path,
  c.file_path,
  c.feature_id,
  c.related_feature_ids,
  c.source_kind,
  c.line_count,
  c.is_route,
  c.is_svelte_comp,
  c.has_auth,
  c.has_zod,
  c.drizzle_refs,
  c.imports,
  c.exports,
  c.route_handlers,
  c.tags,
  c.som_cluster,
  c.centroid_id,
  c.qdrant_point_id,
  c.cluster_id,
  c.atlas_version,
  c.cold_storage_ready,
  -- synthesis scores
  sr.karpathy_blend,
  sr.pagerank_score,
  sr.attention_score,
  -- feature context
  fr.dominant_status        AS feature_dominant_status,
  fr.avg_confidence         AS feature_avg_confidence,
  fr.primary_cluster_id     AS feature_primary_cluster,
  fr.behavior_score         AS feature_behavior_score,
  -- readiness flags
  CASE WHEN c.qdrant_point_id IS NOT NULL THEN true ELSE false END AS has_vector,
  CASE WHEN c.centroid_id IS NOT NULL THEN true ELSE false END     AS has_centroid
FROM cold_parent_atlas_cards c
LEFT JOIN cold_source_ref_rollups sr ON sr.source_ref = c.source_ref
LEFT JOIN cold_feature_rollups fr ON fr.feature_id = c.feature_id
ORDER BY c.line_count DESC NULLS LAST;

SELECT 'cold_profile_card_candidates' AS tbl, COUNT(*) AS rows FROM cold_profile_card_candidates;
SELECT 'candidates_with_vector' AS label, COUNT(*) AS rows FROM cold_profile_card_candidates WHERE has_vector;
SELECT 'candidates_with_centroid' AS label, COUNT(*) AS rows FROM cold_profile_card_candidates WHERE has_centroid;

-- ── 5. cold_hot_path_rollups ──────────────────────────────────────────────────
-- Runtime hot-path telemetry joined with file lineage.
-- route_runtime_packets is currently empty (0 rows) — this will populate once
-- runtime telemetry is collected.

CREATE OR REPLACE TABLE cold_hot_path_rollups AS
SELECT
  rrp.id,
  rrp.route_path,
  rrp.method,
  rrp.source_refs,
  rrp.feature_ids,
  rrp.packet_count,
  rrp.avg_latency_ms,
  rrp.error_count,
  rrp.p95_latency_ms,
  rrp.last_seen_at,
  rrp.created_at,
  -- runtime hot-path score: higher latency + error rate = higher priority
  COALESCE(rrp.avg_latency_ms, 0) / 1000.0 +
    COALESCE(rrp.error_count, 0) * 0.5       AS runtime_hot_path_score
FROM pg_db.route_runtime_packets rrp;

SELECT 'cold_hot_path_rollups' AS tbl, COUNT(*) AS rows FROM cold_hot_path_rollups;

-- ── Summary stats ─────────────────────────────────────────────────────────────

SELECT
  'offline_synthesis_summary'                           AS report,
  (SELECT COUNT(*) FROM cold_parent_atlas_cards)        AS total_file_cards,
  (SELECT COUNT(*) FROM cold_feature_rollups)           AS total_feature_rollups,
  (SELECT COUNT(*) FROM cold_source_ref_rollups)        AS total_source_ref_rollups,
  (SELECT COUNT(*) FROM cold_profile_card_candidates)   AS profile_card_candidates,
  (SELECT COUNT(*) FROM cold_hot_path_rollups)          AS hot_path_entries,
  (SELECT COUNT(*) FROM cold_profile_card_candidates WHERE has_vector) AS candidates_with_vector,
  (SELECT COUNT(*) FROM cold_profile_card_candidates WHERE has_centroid) AS candidates_with_centroid,
  NOW()                                                 AS generated_at;
