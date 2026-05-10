-- Migration: add legal_documents.jurisdiction column.
--
-- Surfaced 2026-05-10 by /api/rag/search-fused returning sparse-lane error:
--   error: column ld.jurisdiction does not exist
-- when a jurisdiction filter was passed.
--
-- The Drizzle schema-postgres.ts declares this column on legal_documents
-- (varchar(100)), but the DB never had it. The Phase 1 sparse-BM25 path
-- accepts an optional jurisdiction filter — adding the column lets the
-- predicate run instead of throwing.
--
-- Apply: psql $DATABASE_URL -f drizzle/manual/20260510_legal_documents_jurisdiction.sql
-- Idempotent — safe to re-run.

ALTER TABLE legal_documents
  ADD COLUMN IF NOT EXISTS jurisdiction varchar(100);

-- Partial index — most legal_documents rows will have NULL jurisdiction
-- (statutes are federal/state; case law is jurisdiction-keyed at chunk level).
CREATE INDEX IF NOT EXISTS legal_documents_jurisdiction_idx
  ON legal_documents (jurisdiction) WHERE jurisdiction IS NOT NULL;
