-- Phase 2F.1: Evaluation Evidence (Deterministic Extraction Provenance)
-- Task 2F1-1A4: Create evaluation_evidence migration
--
-- Separates evidence extraction from human judgment:
-- - Evidence table: deterministic artifacts extracted from code/routes/schemas/tests
-- - Relevance table: human judgment about whether those artifacts are relevant to a query
--
-- This separation prevents circular reasoning where synthetic consensus becomes "ground truth"

CREATE TABLE IF NOT EXISTS evaluation_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Evidence identity
  packet_key TEXT NOT NULL,  -- canonical identity
  source_ref TEXT NOT NULL,  -- file path or entity reference
  query_id UUID NOT NULL REFERENCES evaluation_queries(id) ON DELETE CASCADE,

  -- Evidence type and extraction
  evidence_type VARCHAR(50) NOT NULL,  -- ast, route, schema, test, semantic
  evidence_detail JSONB NOT NULL,  -- structured detail specific to evidence_type

  -- Extraction provenance
  extractor_version VARCHAR(20) NOT NULL,  -- e.g., "tree-sitter-v0.20", "ast-grep-v1.0", "gemma4-v0.1"
  extractor_name VARCHAR(100) NOT NULL,  -- e.g., "ts-ast-walker", "route-manifest-scanner", "schema-parser"
  confidence REAL NOT NULL,  -- 0.0-1.0 confidence in the extraction

  -- Validation
  CONSTRAINT ck_evidence_type CHECK (evidence_type IN ('ast', 'route', 'schema', 'test', 'semantic')),
  CONSTRAINT ck_extractor_confidence CHECK (confidence BETWEEN 0.0 AND 1.0),
  CONSTRAINT ck_not_null CHECK (packet_key IS NOT NULL AND source_ref IS NOT NULL)
);

CREATE INDEX idx_evaluation_evidence_packet_query ON evaluation_evidence(packet_key, query_id);
CREATE INDEX idx_evaluation_evidence_query ON evaluation_evidence(query_id);
CREATE INDEX idx_evaluation_evidence_type ON evaluation_evidence(evidence_type);
CREATE INDEX idx_evaluation_evidence_extractor ON evaluation_evidence(extractor_name, extractor_version);
CREATE INDEX idx_evaluation_evidence_confidence ON evaluation_evidence(confidence DESC);
CREATE INDEX idx_evaluation_evidence_source_ref ON evaluation_evidence(source_ref);

-- Composite index for evidence aggregation (find all evidence for a packet across all queries)
CREATE INDEX idx_evaluation_evidence_packet_type ON evaluation_evidence(packet_key, evidence_type);
