-- pgvector HNSW index plan — Phase 6E
-- All indexes are CONCURRENTLY + IF NOT EXISTS — safe on live tables

-- 1. evidence_vectors (vector 384)
CREATE INDEX CONCURRENTLY IF NOT EXISTS evidence_vectors_hnsw_idx
  ON evidence_vectors USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 2. codebase_chunk_index (halfvec 768)
-- Already exists as 'codebase_chunk_index_content_hnsw'
CREATE INDEX CONCURRENTLY IF NOT EXISTS codebase_chunk_index_summary_hnsw
  ON codebase_chunk_index USING hnsw (summary_embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3. legal_documents (vector 768)
CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_documents_hnsw_idx
  ON legal_documents USING hnsw (content_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. document_embeddings (vector 384)
CREATE INDEX CONCURRENTLY IF NOT EXISTS document_embeddings_hnsw_idx
  ON document_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. embedding_cache (vector 768)
CREATE INDEX CONCURRENTLY IF NOT EXISTS embedding_cache_hnsw_idx
  ON embedding_cache USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 6. warden_chunks (vector 768)
CREATE INDEX CONCURRENTLY IF NOT EXISTS warden_chunks_hnsw_idx
  ON warden_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
