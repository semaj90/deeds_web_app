-- Session 53: Add indexes for KAG/DAG evidence retrieval joins
-- These indexes prevent sequential scans on graph traversal and dual-search queries.
-- All use IF NOT EXISTS for idempotent re-runs.

-- ─── evidence table ────────────────────────────────────────────────────
-- Primary lookup: every case-scoped evidence query filters by case_id
CREATE INDEX IF NOT EXISTS idx_evidence_case_id
  ON evidence (case_id);

-- Upload dedup: hash lookup for re-upload detection
CREATE INDEX IF NOT EXISTS idx_evidence_hash
  ON evidence (hash) WHERE hash IS NOT NULL;

-- ─── evidence_vectors table ────────────────────────────────────────────
-- FK lookup: section expansion joins evidence_vectors → evidence via evidence_id
CREATE INDEX IF NOT EXISTS idx_evidence_vectors_evidence_id
  ON evidence_vectors (evidence_id);

-- Composite: section sibling queries filter by (evidence_id, chunk_index)
CREATE INDEX IF NOT EXISTS idx_evidence_vectors_evidence_chunk
  ON evidence_vectors (evidence_id, chunk_index);

-- JSONB: section-path containment queries used by graph-hop expansion
CREATE INDEX IF NOT EXISTS idx_evidence_vectors_metadata_section
  ON evidence_vectors USING gin (metadata jsonb_path_ops);

-- pgvector HNSW: cosine similarity search on embedding column
-- Only create if the embedding column exists as vector type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence_vectors'
    AND column_name = 'embedding'
    AND udt_name = 'vector'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_evidence_vectors_embedding_hnsw
      ON evidence_vectors USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)';
    RAISE NOTICE 'Created HNSW index on evidence_vectors.embedding';
  ELSE
    RAISE NOTICE 'Skipping HNSW index: embedding column is not vector type';
  END IF;
END $$;

-- ─── yorha_evidence_nodes: composite for KAG lookup ────────────────────
-- The enrichWithGraphNeighbors() query filters by (case_id, status, file_path)
CREATE INDEX IF NOT EXISTS idx_yorha_nodes_case_status
  ON yorha_evidence_nodes (case_id, status);

CREATE INDEX IF NOT EXISTS idx_yorha_nodes_file_path
  ON yorha_evidence_nodes (file_path) WHERE file_path IS NOT NULL;

-- ─── yorha_evidence_connections: composite for 1-hop traversal ─────────
-- The 1-hop query joins on (case_id, source_node_id) and (case_id, target_node_id)
-- then orders by strength DESC, confidence_score DESC
CREATE INDEX IF NOT EXISTS idx_yorha_connections_case_source
  ON yorha_evidence_connections (case_id, source_node_id);

CREATE INDEX IF NOT EXISTS idx_yorha_connections_case_target
  ON yorha_evidence_connections (case_id, target_node_id);
