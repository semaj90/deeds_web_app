-- EmbeddingGemma 2 (Q8_0) challenger embeddings, separate from the canonical semantic_768 column.
-- Additive only: no change to codebase_chunk_index. Idempotent (IF NOT EXISTS).
-- Canonical rule: this table is a challenger representation; it does not replace semantic_768.

CREATE TABLE IF NOT EXISTS codebase_chunk_eg2_embeddings (
  source_id        UUID PRIMARY KEY REFERENCES codebase_chunk_index(id) ON DELETE CASCADE,
  relative_path    TEXT NOT NULL,
  domain           VARCHAR(255),
  content_hash     TEXT,
  representation_id TEXT NOT NULL DEFAULT 'embeddinggemma2-q8-challenger',
  model_revision   TEXT NOT NULL,
  embedding        halfvec(768) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS codebase_chunk_eg2_embeddings_hnsw
  ON codebase_chunk_eg2_embeddings USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 200);

CREATE INDEX IF NOT EXISTS codebase_chunk_eg2_embeddings_domain_idx
  ON codebase_chunk_eg2_embeddings (domain);
