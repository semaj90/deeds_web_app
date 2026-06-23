-- ============================================================================
-- Phase 1: Metadata Contract — Add Missing Postgres JSONB Indexes
-- Date: 2026-06-23 Session 72
-- Duration: 5 minutes
-- Risk: Low (indexes only, no data changes)
-- ============================================================================

-- Gate: All 6 indexes created successfully

-- Index 1: SOM cluster (for neighborhood routing)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_som_cluster_expr
ON atlas_packets ((metadata->>'som_cluster')::integer);

-- Index 2: Ontology label (for semantic domain filtering)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_ontology_label_expr
ON atlas_packets ((metadata->>'ontology_label'));

-- Index 3: Topology label (for DAG routing)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_topology_label_expr
ON atlas_packets ((metadata->>'topology_label'));

-- Index 4: Retrieval strategy (for ACE routing decision)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_retrieval_strategy_expr
ON atlas_packets ((metadata->>'retrieval_strategy'));

-- Index 5: AE confidence (for confidence gating)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_ae_confidence_expr
ON atlas_packets ((metadata->'ae_confidence')::numeric);

-- Index 6: Trace ID (for provenance audit chain)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_trace_id_expr
ON atlas_packets ((metadata->>'trace_id'));

-- ============================================================================
-- Verification
-- ============================================================================

-- Verify all 6 indexes created
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'atlas_packets'
AND indexname LIKE 'idx_atlas_packets_%expr'
ORDER BY indexname;

-- Expected output: 6 rows
-- ✅ idx_atlas_packets_ae_confidence_expr
-- ✅ idx_atlas_packets_ontology_label_expr
-- ✅ idx_atlas_packets_retrieval_strategy_expr
-- ✅ idx_atlas_packets_som_cluster_expr
-- ✅ idx_atlas_packets_topology_label_expr
-- ✅ idx_atlas_packets_trace_id_expr
