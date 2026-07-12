-- Phase 2F.1: Real Evaluation Corpus Schema
-- Creates ground-truth tables for retrieval evaluation

-- Task 1.1: evaluation_queries table
CREATE TABLE IF NOT EXISTS evaluation_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  domain VARCHAR(50) NOT NULL,  -- programming-languages, web-markup, networking, architecture, algorithms
  difficulty INTEGER NOT NULL,  -- 1-5 scale
  expected_count INTEGER,        -- expected number of relevant results
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT ck_difficulty CHECK (difficulty BETWEEN 1 AND 5)
);

CREATE INDEX idx_evaluation_queries_domain ON evaluation_queries(domain);
CREATE INDEX idx_evaluation_queries_difficulty ON evaluation_queries(difficulty);

-- Task 1.2: evaluation_relevance table
CREATE TABLE IF NOT EXISTS evaluation_relevance (
  query_id UUID NOT NULL REFERENCES evaluation_queries(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL,  -- reference to codebase_chunk_index.id
  grade SMALLINT NOT NULL,  -- 0-3 relevance scale (0=not relevant, 3=highly relevant)
  source_type VARCHAR(20) NOT NULL,  -- AST, route, schema, test
  extractor_version VARCHAR(20) NOT NULL,  -- e.g., "v1.0"
  confidence REAL NOT NULL,  -- 0.0-1.0 confidence score
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  PRIMARY KEY (query_id, chunk_id),
  CONSTRAINT ck_grade CHECK (grade BETWEEN 0 AND 3),
  CONSTRAINT ck_confidence CHECK (confidence BETWEEN 0.0 AND 1.0),
  CONSTRAINT ck_source_type CHECK (source_type IN ('AST', 'route', 'schema', 'test'))
);

CREATE INDEX idx_evaluation_relevance_query ON evaluation_relevance(query_id);
CREATE INDEX idx_evaluation_relevance_chunk ON evaluation_relevance(chunk_id);
CREATE INDEX idx_evaluation_relevance_source_type ON evaluation_relevance(source_type);
CREATE INDEX idx_evaluation_relevance_confidence ON evaluation_relevance(confidence);

-- Task 1.3: Extend phase2f_evaluation_results with ablation tracking
-- (Assumes table already exists; adds columns if missing)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'phase2f_evaluation_results') THEN
    ALTER TABLE phase2f_evaluation_results
    ADD COLUMN IF NOT EXISTS ablation_id INTEGER,
    ADD COLUMN IF NOT EXISTS lane_name VARCHAR(50);
  END IF;
END $$;
