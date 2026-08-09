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
  -- file_ext never existed on parent_atlas_documents/atlas_packets; derive from rel_path instead
  -- of leaving it a phantom column (2026-08-09 fix).
  regexp_extract(pad.rel_path, '\.[^./\\]+$') AS file_ext,
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
  -- alias_id / ingest_source never existed on parent_atlas_documents/atlas_packets and have no
  -- derivable source; keep the columns for downstream compatibility, values genuinely unknown
  -- (2026-08-09 fix).
  NULL AS alias_id,
  NULL AS ingest_source,
  pad.created_at,
  pad.updated_at,
  -- enrichment from atlas_feature_map
  afm.som_cluster,
  -- neo4j_node_id / nes_card_id / atlas_version never existed on atlas_feature_map (no writer
  -- populates them anywhere in the repo) -- kept as NULL columns for downstream compatibility
  -- rather than dropped, matching the fix pattern used for pad.alias_id/ingest_source above
  -- (2026-08-09).
  NULL AS neo4j_node_id,
  NULL AS nes_card_id,
  afm.lane_ids,
  NULL AS atlas_version,
  afm.indexed_at            AS afm_indexed_at,
  -- source classification (pad.file_ext doesn't exist -- same derivation as the file_ext column
  -- above, inlined since column aliases from this SELECT list aren't visible here; 2026-08-09)
  CASE
    WHEN pad.is_route        THEN 'route'
    WHEN pad.is_svelte_comp  THEN 'component'
    WHEN regexp_extract(pad.rel_path, '\.[^./\\]+$') IN ('.ts','.js','.mjs','.cjs') THEN 'typescript'
    WHEN regexp_extract(pad.rel_path, '\.[^./\\]+$') = '.sql' THEN 'schema'
    ELSE COALESCE(NULLIF(regexp_extract(pad.rel_path, '\.[^./\\]+$'), ''), 'file')
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
--
-- 2026-08-09: this section originally selected from pg_db.atlas_source_ref_synthesis (a table
-- that has never existed) with columns (source_kind, atlas_rank, atlas_authority, qdrant_point_ids,
-- cluster_ids, som_cluster, synthesized_summary, synthesized_at) that don't exist anywhere in the
-- schema -- not a rename, a reference to data that was never actually produced this way. Per
-- explicit decision, gracefully degraded to only the real columns that exist on
-- atlas_topology_features (source_ref, pagerank_score, karpathy_blend) plus a NULL
-- attention_score placeholder, since those 3 are the only ones consumed downstream (§4). Not a
-- full rewrite of the original intent -- if source_kind/atlas_rank/etc. are ever needed, that
-- requires new source data, not a query fix.

CREATE OR REPLACE TABLE cold_source_ref_rollups AS
SELECT
  atf.source_ref,
  atf.pagerank_score,
  atf.karpathy_blend,
  NULL AS attention_score
FROM pg_db.atlas_topology_features atf;

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
--
-- 2026-08-09: the live `route_runtime_packets` contract is row-level telemetry with
-- `route`, `latency_ms`, `captured_at`, `source_refs`, `feature_ids`,
-- `qdrant_hits`, `cache_hit`, `cache_tier`, etc. It does not expose the older
-- `route_path`, `method`, `packet_count`, `avg_latency_ms`, `error_count`, or
-- `p95_latency_ms` projection names this legacy rollup originally expected, so we
-- derive the same summary surface from the current columns instead of chasing a
-- schema migration.

-- 2026-08-09: rewritten to use the real route_runtime_packets schema directly (route, latency_ms,
-- captured_at, source_refs, feature_ids, qdrant_hits, cache_hit, cache_tier) instead of remapping
-- to a stale shape (route_path, method, packet_count, avg_latency_ms, error_count,
-- p95_latency_ms) that never existed on this table. Root cause: this rollup was written for an
-- older route_runtime_packets shape; canonical fix owner is this SQL file, not a schema migration
-- (the real column names are correct, just weren't used here).
CREATE OR REPLACE TABLE cold_hot_path_rollups AS
SELECT
  rrp.id,
  rrp.route,
  rrp.latency_ms,
  rrp.captured_at,
  rrp.source_refs,
  rrp.feature_ids,
  rrp.qdrant_hits,
  rrp.cache_hit,
  rrp.cache_tier,
  -- runtime hot-path score: higher latency + cache miss = higher priority
  COALESCE(rrp.latency_ms, 0) / 1000.0 +
    CASE WHEN COALESCE(rrp.cache_hit, false) THEN 0 ELSE 0.5 END AS runtime_hot_path_score
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
