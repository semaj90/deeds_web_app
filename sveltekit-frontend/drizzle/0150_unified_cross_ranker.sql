-- Unified Cross-Ranker: Output Tables for Retrieval Results & Decisions
-- Phase 3 Evaluation & Monitoring Tables

-- semantic_top_k: Stores ranked retrieval results from cross-ranker
-- Indexed for fast lookup by query_id and fast timeline queries
CREATE TABLE IF NOT EXISTS semantic_top_k (
  id SERIAL PRIMARY KEY NOT NULL,
  query_id VARCHAR(255) NOT NULL,
  query TEXT NOT NULL,
  packet_key VARCHAR(255) NOT NULL,
  retrieved_rank INTEGER NOT NULL,                  -- Position from Qdrant
  reranked_rank INTEGER NOT NULL,                  -- Position after cross-ranking
  rerank_score REAL NOT NULL,                      -- Final blended score [0,1]
  evidence TEXT,                                   -- Human-readable evidence summary
  component_scores JSONB NOT NULL DEFAULT '{}',   -- {semantic, lexical, topology, naive_bayes}
  metadata JSONB,                                  -- {source_ref, file_path, summary}
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT semantic_top_k_unique UNIQUE(query_id, packet_key)
);

-- Indexes for retrieval queries
CREATE INDEX IF NOT EXISTS idx_semantic_top_k_query_id ON semantic_top_k(query_id);
CREATE INDEX IF NOT EXISTS idx_semantic_top_k_packet_key ON semantic_top_k(packet_key);
CREATE INDEX IF NOT EXISTS idx_semantic_top_k_score DESC ON semantic_top_k(rerank_score DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_top_k_created_at DESC ON semantic_top_k(created_at DESC);

-- GIN index for component_scores filtering (e.g., "semantic > 0.8")
CREATE INDEX IF NOT EXISTS idx_semantic_top_k_component_scores ON semantic_top_k USING GIN (component_scores);

-- retrieval_decision_log: Audit trail for all ranking decisions
-- Used for understanding why results ranked a certain way, plus metrics
CREATE TABLE IF NOT EXISTS retrieval_decision_log (
  id SERIAL PRIMARY KEY NOT NULL,
  query_id VARCHAR(255) NOT NULL,
  query TEXT NOT NULL,
  decision_type VARCHAR(50) NOT NULL,              -- 'success', 'no_results', 'fallback', 'error'
  confidence REAL NOT NULL,                        -- avg confidence across results
  ranked_count INTEGER NOT NULL DEFAULT 0,
  stage_timings JSONB,                             -- {semantic_normalization, bm25_fetch, topology_fetch, ...}
  error_message TEXT,                              -- if decision_type = 'error'
  execution_trace JSONB,                           -- {qdrant_stage, bm25_stage, ...}
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT decision_log_not_null CHECK (
    (decision_type = 'error' AND error_message IS NOT NULL) OR
    (decision_type != 'error')
  )
);

-- Indexes for analytics & monitoring
CREATE INDEX IF NOT EXISTS idx_retrieval_decision_log_query_id ON retrieval_decision_log(query_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_decision_log_decision_type ON retrieval_decision_log(decision_type);
CREATE INDEX IF NOT EXISTS idx_retrieval_decision_log_created_at DESC ON retrieval_decision_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retrieval_decision_log_confidence DESC ON retrieval_decision_log(confidence DESC);

-- v_packet_topology_scores: Materialized view for PageRank-based topology scoring
-- Fallback source when Neo4j unavailable, computed from Postgres graph data
CREATE OR REPLACE VIEW v_packet_topology_scores AS
SELECT
  ap.packet_key,
  COALESCE(ap.page_rank_score, 0.5) as page_rank_score,
  ap.community_id,
  ap.community_confidence,
  ap.updated_at
FROM atlas_packets ap
WHERE ap.packet_key IS NOT NULL
ORDER BY ap.page_rank_score DESC;

-- Grant permissions (if using role-based access)
-- GRANT SELECT ON semantic_top_k TO application_user;
-- GRANT SELECT ON retrieval_decision_log TO application_user;
-- GRANT SELECT ON v_packet_topology_scores TO application_user;

-- ═══════════════════════════════════════════════════════════════
-- Verification & Metadata
-- ═══════════════════════════════════════════════════════════════

-- Add comments for schema documentation
COMMENT ON TABLE semantic_top_k IS 'Ranked retrieval results from cross-ranker (semantic, lexical, topology, naive_bayes blend)';
COMMENT ON TABLE retrieval_decision_log IS 'Audit trail for retrieval ranking decisions, stage timings, and error tracking';
COMMENT ON VIEW v_packet_topology_scores IS 'PageRank scores for packets (fallback to Postgres when Neo4j unavailable)';

COMMENT ON COLUMN semantic_top_k.query_id IS 'Unique identifier for retrieval query session';
COMMENT ON COLUMN semantic_top_k.rerank_score IS 'Final blended score: 0.40*semantic + 0.30*lexical + 0.20*topology + 0.10*naive_bayes';
COMMENT ON COLUMN semantic_top_k.component_scores IS 'JSON with {semantic, lexical, topology, naive_bayes} component scores [0,1]';
COMMENT ON COLUMN retrieval_decision_log.decision_type IS 'success|no_results|fallback|error';
COMMENT ON COLUMN retrieval_decision_log.stage_timings IS 'Latency breakdown: {semantic_normalization, bm25_fetch, topology_fetch, bayes_compute, blend, metadata_fetch, persistence}';
