-- Phase 2F.1: Evaluation Results with FeatureEnvelope
-- Task 2F1-1A2: Create evaluation_results migration with canonical packet_key authority
--
-- Key differences from legacy schema:
-- 1. Uses canonical packet_key (not chunk_id) as identity authority
-- 2. Records corpus_version for snapshot freezing
-- 3. Stores per-signal FeatureEnvelope as JSONB
-- 4. Supports all 6 declared ablations via ablation_id
-- 5. RRF formula deterministic (k=60, one-indexed ranks)

CREATE TABLE IF NOT EXISTS evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Evaluation identity
  query_id UUID NOT NULL REFERENCES evaluation_queries(id) ON DELETE CASCADE,
  packet_key TEXT NOT NULL,  -- canonical identity (NOT chunk_id)
  corpus_version TEXT NOT NULL REFERENCES evaluation_corpora(corpus_version) ON DELETE RESTRICT,

  -- Ablation configuration
  ablation_id INTEGER NOT NULL,  -- 1-7, maps to ABLATION_CONFIGS
  ablation_config_name VARCHAR(50) NOT NULL,  -- dense_only, lexical_only, rrf_50_50, etc.

  -- Pipeline metadata
  lane_name VARCHAR(50) NOT NULL,  -- dense, lexical, rrf, ast, metadata, authority, recency
  retrieval_rank INTEGER NOT NULL,  -- 1-indexed position in retrieval results

  -- FeatureEnvelope JSONB (contains all 6 signal fields + computed blends)
  feature_envelope JSONB NOT NULL,  -- { dense?, lexical?, ast?, metadata?, authority?, recency?, rrf_score?, weighted_score?, learned_score? }

  -- Ground-truth comparison
  ground_truth_grade SMALLINT,  -- 0-3 from evaluation_relevance, NULL if not yet graded
  ground_truth_source VARCHAR(20),  -- AST, route, schema, test
  ground_truth_confidence REAL,  -- 0.0-1.0 confidence in ground-truth

  -- Metrics
  relevance_predicted REAL,  -- model output score
  relevance_judged SMALLINT,  -- actual human judgment (0-3)
  match_confidence REAL,  -- confidence that predicted matches judged

  -- Validation
  CONSTRAINT ck_ablation_id CHECK (ablation_id BETWEEN 1 AND 7),
  CONSTRAINT ck_retrieval_rank CHECK (retrieval_rank >= 1),
  CONSTRAINT ck_ground_truth_grade CHECK (ground_truth_grade IS NULL OR ground_truth_grade BETWEEN 0 AND 3),
  CONSTRAINT ck_ground_truth_confidence CHECK (ground_truth_confidence IS NULL OR ground_truth_confidence BETWEEN 0.0 AND 1.0),
  CONSTRAINT ck_relevance_predicted CHECK (relevance_predicted BETWEEN 0.0 AND 1.0),
  CONSTRAINT ck_relevance_judged CHECK (relevance_judged IS NULL OR relevance_judged BETWEEN 0 AND 3),
  CONSTRAINT ck_match_confidence CHECK (match_confidence BETWEEN 0.0 AND 1.0)
);

CREATE INDEX idx_evaluation_results_query_corpus ON evaluation_results(query_id, corpus_version);
CREATE INDEX idx_evaluation_results_packet_key ON evaluation_results(packet_key);
CREATE INDEX idx_evaluation_results_ablation ON evaluation_results(ablation_id, ablation_config_name);
CREATE INDEX idx_evaluation_results_lane ON evaluation_results(lane_name);
CREATE INDEX idx_evaluation_results_ground_truth ON evaluation_results(ground_truth_grade, ground_truth_source);
CREATE INDEX idx_evaluation_results_created_at ON evaluation_results(created_at DESC);

-- Composite index for ablation comparisons (retrieve all results for one query, one corpus, all ablations)
CREATE INDEX idx_evaluation_results_query_ablation ON evaluation_results(query_id, corpus_version, ablation_id);
