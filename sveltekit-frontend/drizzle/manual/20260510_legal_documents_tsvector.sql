-- Migration: BM25-style sparse search on legal_documents via Postgres tsvector + GIN.
--
-- Phase 1B of the legal retrieval roadmap (master_agents.md → 2026-05-10 session).
-- Complements the dense Qdrant lane; fused later via RRF in
--   src/lib/server/retrieval/rrf-fuse.ts.
--
-- Why a generated column (vs trigger-maintained):
-- - Postgres 12+ STORED generated columns are synced atomically with the row.
-- - No trigger logic to maintain, no chance of drift, no INSERT/UPDATE penalty
--   beyond the tsvector parse itself.
-- - title weighted A (highest) so direct title matches outrank body matches.
--
-- Apply: psql $DATABASE_URL -f drizzle/manual/20260510_legal_documents_tsvector.sql
-- Idempotent — safe to re-run.

ALTER TABLE legal_documents
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')),   'A') ||
      setweight(to_tsvector('english', coalesce(content, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS legal_documents_content_tsv_gin
  ON legal_documents USING GIN (content_tsv);

-- Usage from TS:
--   SELECT id, title, ts_rank_cd(content_tsv, query) AS score
--     FROM legal_documents, plainto_tsquery('english', $1) AS query
--    WHERE content_tsv @@ query
--    ORDER BY score DESC
--    LIMIT 30;
--
-- See src/lib/server/retrieval/sparse-bm25.ts for the typed wrapper.
