# pgvector HNSW Index Plan (Phase 6E)

This document outlines the high-performance indexing strategy for the legal-ai-db vector tables.

> [!IMPORTANT]
> Do not apply these indexes until PostgreSQL is confirmed healthy on port 5434 and the SQL has been reviewed by an operator.

## Target Tables & Dimensions

| Table | Dimension | Column | Op Class | Status |
|-------|-----------|--------|----------|--------|
| `evidence_vectors` | 384 | `embedding` | `vector_cosine_ops` | Pending |
| `codebase_chunk_index` | 768 | `summary_embedding` | `halfvec_cosine_ops` | Pending |
| `legal_documents` | 768 | `content_embedding` | `vector_cosine_ops` | Pending |
| `document_embeddings` | 384 | `embedding` | `vector_cosine_ops` | Pending |
| `embedding_cache` | 768 | `embedding` | `vector_cosine_ops` | Pending |
| `warden_chunks` | 768 | `embedding` | `vector_cosine_ops` | Pending |

## Execution Plan

The following SQL will be applied via `sveltekit-frontend/drizzle/manual/20260516_hnsw_indexes.sql` once reviewed:

```sql
-- 1. evidence_vectors (vector 384)
CREATE INDEX CONCURRENTLY IF NOT EXISTS evidence_vectors_hnsw_idx
  ON evidence_vectors USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 2. codebase_chunk_index (halfvec 768)
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
```

## Validation
After application, run the following to verify:
```bash
npm run audit:pgvector
```
Or check manually:
```sql
SELECT indexname, indexdef FROM pg_indexes WHERE indexdef ILIKE '%hnsw%';
```