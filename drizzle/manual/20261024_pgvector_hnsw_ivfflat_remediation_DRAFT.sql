-- ============================================================================
-- Migration: Remediate Duplicate HNSW & Legacy IVFFlat Indexes (Audit V1)
-- Created: 2026-10-24
-- Status: DRAFT, NOT APPLIED (planned_sidecar)
-- Evidence Receipt: docs/reports/pgvector-hnsw-ivfflat-diskann-audit-v1.json
--
-- Companion to:
--   - drizzle/manual/20261017_codebase_chunk_index_hnsw.sql
--     (builds idx_codebase_chunk_content_embedding_768_hnsw_ef200 with ef_construction=200)
--   - drizzle/manual/20261017_reconcile_summary_768_and_vector_io_cleanup.sql
--
-- Findings remediated by this staged sidecar:
--   1. DUPLICATE_HNSW_INDEX on public.agent_observations (hnsw_embedding):
--      Both idx_agent_observations_hnsw and idx_agent_observations_hnsw_768
--      are identical HNSW (m=16, ef_construction=64) indexes. Drops the
--      unqualified duplicate idx_agent_observations_hnsw concurrently.
--   2. REDUNDANT_IVFFLAT_AND_HNSW_COEXISTENCE on public.cluster_summaries:
--      cluster_summaries.summary_embedding has both cluster_summaries_embedding_hnsw
--      and idx_cluster_summaries_embedding_ivfflat (lists=5). Drops the redundant
--      IVFFlat index concurrently.
--   3. LEGACY_IVFFLAT_ONLY on public.chat_embeddings (embedding):
--      Builds idx_chat_embeddings_embedding_hnsw concurrently (m=16, ef_construction=64)
--      before retiring legacy idx_chat_embeddings_embedding (ivfflat lists=50).
--
-- Execution policy:
--   Run each statement outside a transaction block with CONCURRENTLY only after
--   operator approval and catalog indisvalid verification.
-- ============================================================================

-- Step 1: Build HNSW replacement candidate on chat_embeddings.embedding
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_embeddings_embedding_hnsw
    ON public.chat_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Step 2: Drop redundant IVFFlat index on cluster_summaries.summary_embedding
-- (cluster_summaries_embedding_hnsw is already active and valid)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_cluster_summaries_embedding_ivfflat;

-- Step 3: Drop exact duplicate HNSW index on agent_observations.hnsw_embedding
-- (idx_agent_observations_hnsw_768 is retained as canonical HNSW index)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_agent_observations_hnsw;

-- Step 4: Only after verifying idx_chat_embeddings_embedding_hnsw indisvalid = true:
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_chat_embeddings_embedding;
