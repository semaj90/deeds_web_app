-- DRAFT_SUPERSEDED_PENDING_ANALYSIS_OWNER -- DO NOT APPLY.
-- Summary-only draft superseded by the ExternalDocAnalysisV1 contract (conceptual owner: atlas_external_doc_analyses, keyed by
-- chunkId + chunkEvidenceRevision + analysisType + producer/model/prompt revisions, append-only). Kept as historical evidence, not deleted.
-- Owner audit 2026-09-23: atlas_summary_layers and analysis_pass_results are packet_key keyed and cannot carry chunk evidence identity.

-- Ornith summaries for external docs (admin/library crawled-docs view).
-- Additive only (CREATE ... IF NOT EXISTS). NOT APPLIED by the author; operator applies after review.
--
-- Derived, non-canonical layer: LLM output is kept OUT of atlas_external_doc_chunks (canonical evidence)
-- and keyed by the exact evidence it summarizes, so a re-crawl or a new summarizer revision never
-- overwrites an older summary and a stale summary is detectable (evidence_revision mismatch).

CREATE TABLE IF NOT EXISTS atlas_external_doc_summaries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id              uuid NOT NULL REFERENCES atlas_external_doc_pages(id) ON DELETE CASCADE,
  chunk_id             text,                       -- NULL = page-level summary
  evidence_revision    text NOT NULL,              -- copied from the page/chunk summarized
  summary_text         text NOT NULL,
  summarizer           text NOT NULL,              -- e.g. 'ornith-1.5-9b'
  summarizer_revision  text NOT NULL,              -- model file digest or server props revision
  prompt_revision      text NOT NULL,
  input_checksum       text NOT NULL,              -- sha256 of the exact text sent to the model
  canonical_authority  boolean NOT NULL DEFAULT false CHECK (canonical_authority = false),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS aeds_identity_uq
  ON atlas_external_doc_summaries (page_id, COALESCE(chunk_id, ''), evidence_revision, summarizer_revision, prompt_revision);
CREATE INDEX IF NOT EXISTS aeds_page_id ON atlas_external_doc_summaries (page_id);
CREATE INDEX IF NOT EXISTS aeds_fts_gin
  ON atlas_external_doc_summaries USING gin (to_tsvector('english', summary_text));
