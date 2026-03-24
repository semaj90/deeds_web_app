-- ============================================================================
-- pgvector HNSW Indexes + Schema Corrections
-- Created: 2026-03-23
--
-- Fixes:
--   1. Add HNSW indexes on all 768-dim vector columns (evidence_vectors priority)
--      Without HNSW, every cosine similarity query is O(n) sequential scan.
--      HNSW parameters: m=16, ef_construction=200 (matches Qdrant config)
--
--   2. Fix vector_outbox.vector: was text (incorrect dim=384 comment), now vector(768)
--
--   3. Fix embedding_cache.embedding: was text (required JSON.stringify), now vector(768)
--      This enables native pgvector <=> cosine operator on the cache table.
--
--   4. Drop document_chunks.embedding: column has no active writer
--      Evidence chunks are stored in evidence_vectors (pgvector) + evidence_items (Qdrant)
-- ============================================================================

-- ── 1. Fix column types ──────────────────────────────────────────────────────

-- vector_outbox.vector: text → vector(768)
-- Safe: outbox is a transient work queue; existing text values are invalid anyway
ALTER TABLE vector_outbox
    ALTER COLUMN vector TYPE vector(768)
    USING NULL;

-- embedding_cache.embedding: text → vector(768)
-- Truncate first since JSON-serialised text cannot auto-cast to vector
TRUNCATE TABLE embedding_cache;
ALTER TABLE embedding_cache
    ALTER COLUMN embedding TYPE vector(768)
    USING NULL;
-- Re-add NOT NULL after truncate/type change
ALTER TABLE embedding_cache
    ALTER COLUMN embedding SET NOT NULL;

-- document_chunks.embedding: drop unused column
ALTER TABLE document_chunks
    DROP COLUMN IF EXISTS embedding;

-- ── 2. HNSW indexes (CONCURRENTLY to avoid locking production reads) ─────────
-- m=16: graph connectivity (higher = better recall, more memory)
-- ef_construction=200: build-time queue depth (matches Qdrant HNSW config)
-- vector_cosine_ops: L2-normalised cosine distance (same metric as Qdrant Cosine)

-- evidence_vectors uses 'vector' column (not 'embedding'); HNSW already exists as idx_evidence_vectors_hnsw
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS evidence_vectors_embedding_hnsw
--     ON evidence_vectors USING hnsw (vector vector_cosine_ops)
--     WITH (m = 16, ef_construction = 200);

CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_documents_content_embedding_hnsw
    ON legal_documents USING hnsw (content_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- document_chunks.embedding was dropped above (no active writer); no index needed

CREATE INDEX CONCURRENTLY IF NOT EXISTS statute_chunks_embedding_hnsw
    ON statute_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_glossary_embedding_hnsw
    ON legal_glossary USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX CONCURRENTLY IF NOT EXISTS embedding_cache_embedding_hnsw
    ON embedding_cache USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX CONCURRENTLY IF NOT EXISTS case_embeddings_embedding_hnsw
    ON case_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- chat_embeddings: for SSE context lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_embeddings_embedding_hnsw
    ON chat_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- ── 3. Set IVFFlat ef_search session default for query-time recall tuning ────
-- Default ef_search=40 balances recall vs latency; increase per session for high-precision queries:
--   SET hnsw.ef_search = 100;
ALTER DATABASE legal_ai_db SET hnsw.ef_search = 40;
