-- Evidence Analysis Cache table
-- Queryable analysis results for fast client hits (YOLO, VLM, LLM synthesis, graph)
-- Mirrors evidence.metadata JSONB into structured columns for indexed queries

CREATE TABLE IF NOT EXISTS evidence_analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL,
  case_id UUID,
  analysis_type VARCHAR(50) NOT NULL, -- 'yolo', 'vlm', 'llm_synthesis', 'combined'
  result JSONB NOT NULL,
  result_embedding VECTOR(768),
  confidence REAL DEFAULT 0.0,
  object_count INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]'::jsonb,
  llm_escalated BOOLEAN DEFAULT false,
  processing_time_ms INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS evidence_analysis_cache_evidence_id_idx ON evidence_analysis_cache(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_analysis_cache_case_id_idx ON evidence_analysis_cache(case_id);
CREATE INDEX IF NOT EXISTS evidence_analysis_cache_type_idx ON evidence_analysis_cache(analysis_type);
CREATE INDEX IF NOT EXISTS evidence_analysis_cache_case_type_idx ON evidence_analysis_cache(case_id, analysis_type);
CREATE INDEX IF NOT EXISTS evidence_analysis_cache_expires_idx ON evidence_analysis_cache(expires_at) WHERE expires_at IS NOT NULL;

-- HNSW index for semantic search over analysis result embeddings
CREATE INDEX IF NOT EXISTS evidence_analysis_cache_embedding_idx
  ON evidence_analysis_cache
  USING hnsw (result_embedding vector_cosine_ops)
  WHERE result_embedding IS NOT NULL;
