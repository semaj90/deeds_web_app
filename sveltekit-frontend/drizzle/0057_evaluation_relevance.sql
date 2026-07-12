-- Phase 2F.1: Evaluation Relevance (Human Judgment)
-- Task 2F1-1A4: Create evaluation_relevance migration with corrected schema
--
-- CORRECTED from 0052: Uses packet_key (canonical identity) not chunk_id
-- Records the human judgment about whether extracted evidence is relevant to a query
--
-- Ground truth flow:
-- 1. Extract evidence (deterministic, version-tracked) → evaluation_evidence
-- 2. Judge relevance (human, one-time per query×packet×corpus) → evaluation_relevance
-- 3. Compare retrieval rankings against this ground truth → evaluation_results
--
-- PRIMARY KEY (query_id, packet_key, corpus_version) enforces:
-- - One judgment per query/packet/corpus combination
-- - Judgment versioning across corpus re-indexing (different corpuses = different judgments)
-- - No re-judgment within same corpus (idempotent)

CREATE TABLE IF NOT EXISTS evaluation_relevance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Relevance identity (canonical packet_key, not chunk_id)
  query_id UUID NOT NULL REFERENCES evaluation_queries(id) ON DELETE CASCADE,
  packet_key TEXT NOT NULL,  -- canonical identity
  source_ref TEXT NOT NULL,  -- file path or entity reference
  chunk_id UUID,  -- optional: specific chunk if known (legacy compatibility)
  qdrant_point_id TEXT,  -- optional: specific Qdrant point for this corpus

  -- Ground-truth judgment
  corpus_version TEXT NOT NULL REFERENCES evaluation_corpora(corpus_version) ON DELETE RESTRICT,
  relevance_grade SMALLINT NOT NULL,  -- 0=not relevant, 1=marginal, 2=relevant, 3=highly relevant
  judgment_source VARCHAR(50) NOT NULL,  -- human, synthetic, derived, audit
  confidence REAL NOT NULL,  -- 0.0-1.0 confidence in the judgment

  -- Evidence linking
  evidence_ids UUID[] NOT NULL DEFAULT '{}',  -- array of evaluation_evidence IDs that support this judgment

  -- Content hash for audit trail (detect if evidence changed)
  content_hash TEXT,  -- SHA-256 hash of packet content at time of judgment

  -- Ensure one judgment per (query, packet, corpus) combination
  UNIQUE (query_id, packet_key, corpus_version),

  -- Validation
  CONSTRAINT ck_relevance_grade CHECK (relevance_grade BETWEEN 0 AND 3),
  CONSTRAINT ck_judgment_confidence CHECK (confidence BETWEEN 0.0 AND 1.0),
  CONSTRAINT ck_judgment_source CHECK (judgment_source IN ('human', 'synthetic', 'derived', 'audit')),
  CONSTRAINT ck_not_null CHECK (packet_key IS NOT NULL AND source_ref IS NOT NULL)
);

CREATE INDEX idx_evaluation_relevance_query_corpus ON evaluation_relevance(query_id, corpus_version);
CREATE INDEX idx_evaluation_relevance_packet_key ON evaluation_relevance(packet_key);
CREATE INDEX idx_evaluation_relevance_grade ON evaluation_relevance(relevance_grade);
CREATE INDEX idx_evaluation_relevance_source ON evaluation_relevance(judgment_source);
CREATE INDEX idx_evaluation_relevance_confidence ON evaluation_relevance(confidence DESC);
CREATE INDEX idx_evaluation_relevance_corpus_version ON evaluation_relevance(corpus_version);

-- Composite index for full relevance judgments (find all judgments for a query in a specific corpus)
CREATE INDEX idx_evaluation_relevance_query_grade_corpus ON evaluation_relevance(query_id, relevance_grade, corpus_version);

-- Index for corpus comparisons (find packets judged across multiple corpus versions)
CREATE INDEX idx_evaluation_relevance_packet_corpus ON evaluation_relevance(packet_key, corpus_version);
