-- Migration: Standardize all vector dimensions to 384 for embeddinggemma:latest -- Date: 2025-10-17 -- Purpose:
Consolidate mixed vector dimensions (384/512/768/1536) to single standard: 384 --
============================================================================ -- STEP 1: Create new 384-dimension columns
-- ============================================================================ -- case_embeddings_optimized ALTER TABLE
IF EXISTS case_embeddings_optimized ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- case_summary_vectors ALTER
TABLE IF EXISTS case_summary_vectors ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- cases (rename to avoid
confusion) ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS case_embedding_384 vector(384); -- chat_messages ALTER
TABLE IF EXISTS chat_messages ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- code_embeddings ALTER TABLE IF
EXISTS code_embeddings ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- document_chunks ALTER TABLE IF EXISTS
document_chunks ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- document_vectors ALTER TABLE IF EXISTS
document_vectors ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- embeddings ALTER TABLE IF EXISTS embeddings ADD
COLUMN IF NOT EXISTS embedding_384 vector(384); -- evidence_vectors ALTER TABLE IF EXISTS evidence_vectors ADD COLUMN IF
NOT EXISTS embedding_384 vector(384); -- knowledge_base (already has embedding_384, ensure it exists) ALTER TABLE IF
EXISTS knowledge_base ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- knowledge_nodes ALTER TABLE IF EXISTS
knowledge_nodes ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- legal_cases ALTER TABLE IF EXISTS legal_cases ADD
COLUMN IF NOT EXISTS embedding_384 vector(384); -- legal_documents ALTER TABLE IF EXISTS legal_documents ADD COLUMN IF
NOT EXISTS embedding_384 vector(384); -- legal_documents_extracted (rename embedding_gemma to embedding_384) ALTER TABLE
IF EXISTS legal_documents_extracted ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- legal_documents_jsonb
(already has 384 columns, skip) -- legal_topics ALTER TABLE IF EXISTS legal_topics ADD COLUMN IF NOT EXISTS
embedding_384 vector(384); -- query_vectors ALTER TABLE IF EXISTS query_vectors ADD COLUMN IF NOT EXISTS embedding_384
vector(384); -- rag_documents (already has embedding_384, ensure it exists) ALTER TABLE IF EXISTS rag_documents ADD
COLUMN IF NOT EXISTS embedding_384 vector(384); -- rag_queries (already 384, skip) -- test_rag_embeddings ALTER TABLE IF
EXISTS test_rag_embeddings ADD COLUMN IF NOT EXISTS embedding_384 vector(384); -- test_rag_search_sessions (already 384,
skip) -- vector_embeddings (already has embedding_384, ensure it exists) ALTER TABLE IF EXISTS vector_embeddings ADD
COLUMN IF NOT EXISTS embedding_384 vector(384); --
============================================================================ -- STEP 2: Create HNSW indexes for new
384-dimension columns -- ============================================================================ -- Note: Creating
indexes can take time on large tables. Run during off-peak hours. CREATE INDEX CONCURRENTLY IF NOT EXISTS
case_embeddings_optimized_embedding_384_hnsw_idx ON case_embeddings_optimized USING hnsw (embedding_384
vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS case_summary_vectors_embedding_384_hnsw_idx ON
case_summary_vectors USING hnsw (embedding_384 vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS
cases_case_embedding_384_hnsw_idx ON cases USING hnsw (case_embedding_384 vector_cosine_ops); CREATE INDEX CONCURRENTLY
IF NOT EXISTS chat_messages_embedding_384_hnsw_idx ON chat_messages USING hnsw (embedding_384 vector_cosine_ops); CREATE
INDEX CONCURRENTLY IF NOT EXISTS code_embeddings_embedding_384_hnsw_idx ON code_embeddings USING hnsw (embedding_384
vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS document_chunks_embedding_384_hnsw_idx ON document_chunks
USING hnsw (embedding_384 vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS
document_vectors_embedding_384_hnsw_idx ON document_vectors USING hnsw (embedding_384 vector_cosine_ops); CREATE INDEX
CONCURRENTLY IF NOT EXISTS embeddings_embedding_384_hnsw_idx ON embeddings USING hnsw (embedding_384 vector_cosine_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS evidence_vectors_embedding_384_hnsw_idx ON evidence_vectors USING hnsw
(embedding_384 vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS knowledge_base_embedding_384_hnsw_idx ON
knowledge_base USING hnsw (embedding_384 vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS
knowledge_nodes_embedding_384_hnsw_idx ON knowledge_nodes USING hnsw (embedding_384 vector_cosine_ops); CREATE INDEX
CONCURRENTLY IF NOT EXISTS legal_cases_embedding_384_hnsw_idx ON legal_cases USING hnsw (embedding_384
vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_documents_embedding_384_hnsw_idx ON legal_documents
USING hnsw (embedding_384 vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS
legal_documents_extracted_embedding_384_hnsw_idx ON legal_documents_extracted USING hnsw (embedding_384
vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_topics_embedding_384_hnsw_idx ON legal_topics USING
hnsw (embedding_384 vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS query_vectors_embedding_384_hnsw_idx ON
query_vectors USING hnsw (embedding_384 vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS
rag_documents_embedding_384_hnsw_idx ON rag_documents USING hnsw (embedding_384 vector_cosine_ops); CREATE INDEX
CONCURRENTLY IF NOT EXISTS test_rag_embeddings_embedding_384_hnsw_idx ON test_rag_embeddings USING hnsw (embedding_384
vector_cosine_ops); CREATE INDEX CONCURRENTLY IF NOT EXISTS vector_embeddings_embedding_384_hnsw_idx ON
vector_embeddings USING hnsw (embedding_384 vector_cosine_ops); --
============================================================================ -- STEP 3: Migration notes --
============================================================================ -- IMPORTANT: This migration creates NEW
columns alongside existing ones. -- Existing embedding columns (512/768/1536) are NOT dropped to allow: -- 1. Gradual
migration with zero downtime -- 2. A/B testing between dimension sizes -- 3. Rollback capability if needed -- To
complete migration: -- 1. Run this migration -- 2. Update application code to use embedding_384 columns -- 3. Backfill
embedding_384 columns using embeddinggemma:latest -- 4. Test thoroughly -- 5. Drop old embedding columns in a future
migration (optional) -- Backfill strategy: -- - Use batch processing (1000 rows at a time) -- - Regenerate embeddings
with embeddinggemma:latest -- - Prioritize tables by usage: legal_documents → rag_documents → others COMMENT ON TABLE
case_embeddings_optimized IS 'Migration 010: Added embedding_384 column for standardization'; COMMENT ON TABLE
legal_documents IS 'Migration 010: Added embedding_384 column for embeddinggemma:latest';
