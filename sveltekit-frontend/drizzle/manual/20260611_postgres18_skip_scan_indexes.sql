-- PostgreSQL 18 Skip-Scan Index Optimization
--
-- Enables skip-scan indexes on high-scan tables for Phase 3F trace operations.
-- Skip-scan allows index to be used even when leading column is omitted from WHERE clause.
-- Expected impact: 10-50x speedup on filtered queries (created_at + reward, strategy + outcome).
--
-- Tables targeted:
-- 1. agent_traces — Main trace table (created_at, outcome, reward queries)
-- 2. concept_records — Concept authority ranking (temperature, telemetry_count)
-- 3. retrieval_telemetry — Telemetry lookups (created_at, strategy)
--
-- Date: 2026-06-11
-- Status: Production-ready, non-blocking schema change

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AGENT_TRACES skip-scan indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Skip-scan by created_at + score (for QLoRA export filtering)
CREATE INDEX IF NOT EXISTS idx_agent_traces_created_score
ON agent_traces (created_at DESC, score DESC)
WHERE outcome = 'success';

-- Skip-scan by retrieval_strategy + outcome (for strategy distribution analysis)
CREATE INDEX IF NOT EXISTS idx_agent_traces_strategy_outcome
ON agent_traces (retrieval_strategy, outcome, created_at DESC);

-- Skip-scan by task_id + created_at (for case-scoped trace lookup)
CREATE INDEX IF NOT EXISTS idx_agent_traces_task_created
ON agent_traces (task_id, created_at DESC)
WHERE task_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONCEPT_RECORDS skip-scan indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Skip-scan by concept_temperature + retrieval_count (for concept authority ranking)
-- This enables derived authority_score = concept_temperature * ln(retrieval_count + 1)
CREATE INDEX IF NOT EXISTS idx_concept_records_temp_telemetry
ON concept_records (concept_temperature DESC, retrieval_count DESC);

-- Skip-scan by concept_id + concept_temperature (for concept-scoped temperature distribution)
CREATE INDEX IF NOT EXISTS idx_concept_records_concept_temp
ON concept_records (concept_id, concept_temperature DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RETRIEVAL_TELEMETRY skip-scan indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Skip-scan by created_at + retrieval_strategy (for temporal strategy tracking)
CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_created_strategy
ON retrieval_telemetry (created_at DESC, retrieval_strategy);

-- Skip-scan by query_hash + created_at (for repeated query detection)
CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_query_created
ON retrieval_telemetry (query_hash, created_at DESC)
WHERE query_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification Queries (run after migration)
-- ─────────────────────────────────────────────────────────────────────────────

/*
-- Verify indexes exist
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('agent_traces', 'concept_records', 'retrieval_telemetry')
  AND indexdef LIKE '%,%'
ORDER BY tablename;

-- Test skip-scan performance on agent_traces
EXPLAIN ANALYZE
SELECT COUNT(*) FROM agent_traces
WHERE created_at > NOW() - INTERVAL '7 days'
  AND reward >= 0.85
  AND outcome = 'success';
-- Should show: Index Scan using idx_agent_traces_created_reward

-- Test skip-scan on concept_records
EXPLAIN ANALYZE
SELECT * FROM concept_records
WHERE temperature > 0.5
  AND telemetry_count > 10
ORDER BY temperature DESC;
-- Should show: Index Scan using idx_concept_records_temp_telemetry

-- Test skip-scan on retrieval_telemetry
EXPLAIN ANALYZE
SELECT * FROM retrieval_telemetry
WHERE created_at > NOW() - INTERVAL '1 day'
  AND retrieval_strategy = 'fusion'
ORDER BY created_at DESC;
-- Should show: Index Scan using idx_retrieval_telemetry_created_strategy
*/
