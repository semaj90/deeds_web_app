-- pgvector 0.8.1 halfvec expression indexes
-- 50% memory savings over float32 HNSW with near-identical recall
-- Uses expression cast (vector::halfvec) — no schema changes needed
-- These indexes are used automatically when queries cast to halfvec

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_vectors_halfvec_hnsw
  ON evidence_vectors USING hnsw ((vector::halfvec(768)) halfvec_cosine_ops) WITH (m=16, ef_construction=200);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_halfvec_hnsw
  ON document_chunks USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops) WITH (m=16, ef_construction=200);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_embeddings_halfvec_hnsw
  ON content_embeddings USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops) WITH (m=16, ef_construction=200);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_embeddings_halfvec_hnsw
  ON case_embeddings USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops) WITH (m=16, ef_construction=200);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_documents_halfvec_hnsw
  ON legal_documents USING hnsw ((content_embedding::halfvec(768)) halfvec_cosine_ops) WITH (m=16, ef_construction=200);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_statute_chunks_halfvec_hnsw
  ON statute_chunks USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops) WITH (m=16, ef_construction=200);
