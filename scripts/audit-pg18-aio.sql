-- PostgreSQL 18 Async I/O audit
-- Run with: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -f /tmp/audit-pg18-aio.sql
-- Or copy-paste sections into psql / Adminer

-- ── 1. Current AIO settings ─────────────────────────────────────────────────
SELECT
  name,
  setting,
  unit,
  context,
  source
FROM pg_settings
WHERE name IN (
  'io_method',
  'io_workers',
  'io_max_concurrency',
  'effective_io_concurrency',
  'maintenance_io_concurrency'
)
ORDER BY name;

-- ── 2. Active AIO handles (requires superuser or pg_read_all_stats) ──────────
SELECT
  pid,
  state,
  operation,
  length,
  target,
  result,
  f_sync,
  f_buffered
FROM pg_aios
ORDER BY pid, io_id;

-- ── 3. Aggregate I/O by backend type ────────────────────────────────────────
SELECT
  backend_type,
  object,
  context,
  reads,
  read_bytes,
  ROUND(read_time::numeric, 2)  AS read_time_ms,
  writes,
  write_bytes,
  ROUND(write_time::numeric, 2) AS write_time_ms
FROM pg_stat_io
ORDER BY read_bytes DESC NULLS LAST;

-- ── 4. Atlas workload benchmarks (run with EXPLAIN ANALYZE for timing) ───────

-- 4a. Scan for missing embeddings (benefits from AIO sequential scan)
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT COUNT(*)
FROM codebase_chunk_index
WHERE content_embedding IS NULL;

-- 4b. Packet type filter (benefits from AIO + partial index)
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT packet_key, source_ref, packet_type
FROM atlas_packets
WHERE packet_type = 'code'
  AND source_ref LIKE 'src/%'
LIMIT 100;

-- 4c. Summary status scan (triggers AIO on large text column)
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT COUNT(*) AS total,
       COUNT(CASE WHEN summary IS NOT NULL AND LENGTH(summary) > 10 THEN 1 END) AS summarized
FROM codebase_chunk_index;

-- ── 5. Recommended safe settings for Docker/WSL2 (apply with ALTER SYSTEM) ──
-- Run each line individually; requires restart for io_method and io_workers.
--
-- ALTER SYSTEM SET io_method = 'worker';         -- default, safe on Docker
-- ALTER SYSTEM SET io_workers = 4;
-- ALTER SYSTEM SET effective_io_concurrency = 32;
-- ALTER SYSTEM SET maintenance_io_concurrency = 16;
-- SELECT pg_reload_conf();   -- only reloads non-restart parameters
--
-- For io_uring (test only after confirming liburing in container):
-- ALTER SYSTEM SET io_method = 'io_uring';
-- -- then restart container; revert to 'worker' if it fails.
