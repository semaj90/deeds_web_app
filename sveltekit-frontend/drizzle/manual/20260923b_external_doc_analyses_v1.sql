-- DRAFT_UNAPPLIED -- EXTERNAL_DOC_ANALYSIS_OWNER_01: owner for ExternalDocAnalysisV1 (replaces the superseded 20260923_external_doc_summaries_v1.sql).
-- NOT APPLIED by the author; the operator applies after review. Additive only (IF NOT EXISTS), no ALTER/DROP of existing tables.
--
-- Derived, non-canonical, APPEND-ONLY layer keyed by the exact canonical chunk evidence it analyzes. LLM/NLP output never lands in
-- atlas_external_doc_chunks. A new model/prompt/producer revision over the same chunk is a NEW row (history is kept); an identical
-- (chunk evidence, type, producer, model, prompt, input) tuple is idempotent (same analysis_id). A stale analysis is detectable because its
-- chunk_evidence_revision no longer matches a current chunk. Columns mirror ExternalDocAnalysisV1 (external-doc-intelligence-contracts-v1.ts).
-- Requires atlas_external_doc_chunks (20260904_external_doc_intelligence_v1.sql). Only useful once canonical chunks exist.

CREATE TABLE IF NOT EXISTS atlas_external_doc_analyses (
  analysis_id             TEXT PRIMARY KEY,                                   -- externalDocAnalysisId(): 'eda:' + sha256 of the identity tuple
  chunk_id                TEXT NOT NULL,                                      -- denormalized address, not identity
  chunk_evidence_revision TEXT NOT NULL
    REFERENCES atlas_external_doc_chunks (evidence_revision) ON DELETE RESTRICT,
  analysis_type           TEXT NOT NULL
    CHECK (analysis_type IN ('SUMMARY', 'ENTITY_EXTRACTION', 'SYMBOL_INFERENCE', 'RELATION_EXTRACTION', 'RECOMMENDATION')),
  producer_id             TEXT NOT NULL,
  producer_revision       TEXT NOT NULL,
  model_id                TEXT,
  model_revision          TEXT,
  prompt_revision         TEXT,
  input_checksum          TEXT NOT NULL CHECK (input_checksum ~ '^[a-f0-9]{64}$'),
  output_checksum         TEXT NOT NULL CHECK (output_checksum ~ '^[a-f0-9]{64}$'),
  summary_text            TEXT,
  entities                JSONB NOT NULL DEFAULT '[]',
  relations               JSONB NOT NULL DEFAULT '[]',
  metadata                JSONB NOT NULL DEFAULT '{}',
  canonical_authority     BOOLEAN NOT NULL DEFAULT false CHECK (canonical_authority = false),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- the two contract refinements from ExternalDocAnalysisV1
  CONSTRAINT aeda_summary_requires_text CHECK (analysis_type <> 'SUMMARY' OR summary_text IS NOT NULL),
  CONSTRAINT aeda_model_requires_revisions CHECK (model_id IS NULL OR (model_revision IS NOT NULL AND prompt_revision IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS aeda_chunk_evidence ON atlas_external_doc_analyses (chunk_evidence_revision, analysis_type);
CREATE INDEX IF NOT EXISTS aeda_chunk_id ON atlas_external_doc_analyses (chunk_id);
CREATE INDEX IF NOT EXISTS aeda_summary_fts_gin
  ON atlas_external_doc_analyses USING gin (to_tsvector('english', coalesce(summary_text, '')));

-- Append-only: rows may be inserted (idempotently, ON CONFLICT (analysis_id) DO NOTHING) but never updated or deleted.
CREATE OR REPLACE FUNCTION atlas_external_doc_analyses_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'atlas_external_doc_analyses is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS aeda_no_update_delete ON atlas_external_doc_analyses;
CREATE TRIGGER aeda_no_update_delete
  BEFORE UPDATE OR DELETE ON atlas_external_doc_analyses
  FOR EACH ROW EXECUTE FUNCTION atlas_external_doc_analyses_append_only();
