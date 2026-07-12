-- Phase 2F.1: Evaluation Relevance (Corrected Schema) — Separate Table
-- Task 2F1-1A4: Create evaluation_relevance_corrected for packet_key-authority
--
-- NOTE: evaluation_relevance from 0052 uses chunk_id authority.
-- This table uses packet_key authority for Phase 2F.1.
-- Both can coexist; Phase 2F.1 uses this corrected version.
-- Eventually migrate historical data or deprecate old table.

CREATE TABLE IF NOT EXISTS evaluation_relevance_corrected (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Relevance identity (canonical packet_key, not chunk_id)
  query_id UUID NOT NULL REFERENCES evaluation_queries(id) ON DELETE CASCADE,
  packet_key TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  chunk_id UUID,
  qdrant_point_id TEXT,

  -- Ground-truth judgment
  corpus_version TEXT NOT NULL REFERENCES evaluation_corpora(corpus_version) ON DELETE RESTRICT,
  relevance_grade SMALLINT NOT NULL,
  judgment_source VARCHAR(50) NOT NULL,
  confidence REAL NOT NULL,

  -- Evidence linking
  evidence_ids UUID[] NOT NULL DEFAULT '{}',

  -- Content hash for audit trail
  content_hash TEXT,

  -- Ensure one judgment per (query, packet, corpus) combination
  UNIQUE (query_id, packet_key, corpus_version),

  -- Validation
  CONSTRAINT ck_relevance_grade CHECK (relevance_grade BETWEEN 0 AND 3),
  CONSTRAINT ck_judgment_confidence CHECK (confidence BETWEEN 0.0 AND 1.0),
  CONSTRAINT ck_judgment_source CHECK (judgment_source IN ('human', 'synthetic', 'derived', 'audit')),
  CONSTRAINT ck_not_null CHECK (packet_key IS NOT NULL AND source_ref IS NOT NULL)
);

CREATE INDEX idx_evaluation_relevance_corrected_query_corpus ON evaluation_relevance_corrected(query_id, corpus_version);
CREATE INDEX idx_evaluation_relevance_corrected_packet_key ON evaluation_relevance_corrected(packet_key);
CREATE INDEX idx_evaluation_relevance_corrected_grade ON evaluation_relevance_corrected(relevance_grade);
CREATE INDEX idx_evaluation_relevance_corrected_source ON evaluation_relevance_corrected(judgment_source);
CREATE INDEX idx_evaluation_relevance_corrected_confidence ON evaluation_relevance_corrected(confidence DESC);
CREATE INDEX idx_evaluation_relevance_corrected_corpus_version ON evaluation_relevance_corrected(corpus_version);
CREATE INDEX idx_evaluation_relevance_corrected_query_grade_corpus ON evaluation_relevance_corrected(query_id, relevance_grade, corpus_version);
CREATE INDEX idx_evaluation_relevance_corrected_packet_corpus ON evaluation_relevance_corrected(packet_key, corpus_version);
