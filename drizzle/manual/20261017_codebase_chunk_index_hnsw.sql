-- ============================================================================
-- Migration: Build an ef_construction=200 HNSW replacement candidate for
-- codebase_chunk_index.content_embedding_768.
-- Created: 2026-10-17
--
-- This is a staged replacement, not an in-place upgrade. PostgreSQL cannot
-- change an existing HNSW index's build parameters with IF NOT EXISTS. Build
-- this distinct candidate concurrently, verify it independently, and only then
-- schedule the old ef_construction=64 index for a separate concurrent drop.
-- Do not execute the drop unless the candidate is valid and its query/recall
-- checks pass. This file has not been applied.
-- Metric: vector_cosine_ops (<=> operator)
-- Parameters:
--   m = 16 (connectivity per node)
--   ef_construction = 200 (build-time construction breadth)
-- Query-time tuning:
--   ef_search is a separate query-time setting; benchmark 40, 64, and 80
--   against exact search before making a recall claim.
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_content_embedding_768_hnsw_ef200
    ON codebase_chunk_index USING hnsw (content_embedding_768 vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);
