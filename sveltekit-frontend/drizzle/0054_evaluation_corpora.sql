-- Phase 2F.1: Evaluation Corpus Manifest
-- Task 2F1-1A5: Frozen corpus snapshots for reproducibility
--
-- Problem: Without corpus versioning, re-indexing breaks older evaluations.
-- Example: Evaluation run on Commit A finds document D at rank 1.
-- Re-index on Commit B changes Qdrant points or chunk boundaries.
-- Old evaluation now points to non-existent point IDs.
-- Metrics become meaningless.
--
-- Solution: Every evaluation run is tied to a frozen corpus manifest.
-- Two runs on different corpus versions are NOT compared.
-- Re-indexing does NOT invalidate older results.
-- Historical tracking of pipeline evolution is enabled.

CREATE TABLE IF NOT EXISTS evaluation_corpora (
  corpus_version TEXT PRIMARY KEY NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Git commit hash (canonical source)
  git_commit TEXT NOT NULL,

  -- Indexing metadata
  postgres_packet_count INTEGER NOT NULL,
  postgres_chunk_count INTEGER NOT NULL,
  qdrant_collection TEXT NOT NULL,
  qdrant_point_count INTEGER NOT NULL,

  -- Embedding model snapshot
  embedding_model TEXT NOT NULL,
  embedding_dimension INTEGER NOT NULL,
  embedding_model_version TEXT NOT NULL,

  -- Query and judgment set hashes (for reproducibility audit)
  query_set_hash TEXT NOT NULL,
  judgment_set_hash TEXT NOT NULL,

  -- Validation
  CONSTRAINT ck_packet_count CHECK (postgres_packet_count > 0),
  CONSTRAINT ck_chunk_count CHECK (postgres_chunk_count > 0),
  CONSTRAINT ck_qdrant_count CHECK (qdrant_point_count >= 0),
  CONSTRAINT ck_embedding_dim CHECK (embedding_dimension > 0)
);

CREATE INDEX idx_evaluation_corpora_git_commit ON evaluation_corpora(git_commit);
CREATE INDEX idx_evaluation_corpora_embedding_model ON evaluation_corpora(embedding_model);
CREATE INDEX idx_evaluation_corpora_created_at ON evaluation_corpora(created_at DESC);

-- Example manifest for current corpus:
-- INSERT INTO evaluation_corpora (
--   corpus_version, git_commit,
--   postgres_packet_count, postgres_chunk_count,
--   qdrant_collection, qdrant_point_count,
--   embedding_model, embedding_dimension, embedding_model_version,
--   query_set_hash, judgment_set_hash
-- ) VALUES (
--   '2026-07-11-main-abc123de',
--   'abc123de...',
--   58365, 40754,
--   'codebase_chunks_768', 40568,
--   'embeddinggemma:latest', 384, 'v1.0',
--   'sha256:...',  -- hash of all 50 query texts
--   'sha256:...'   -- hash of all ground-truth judgments
-- );
