-- Phase 17 Task Semantic Packets Table
-- Stores the output of the PyTorch feature extraction pipeline
-- Input: ReconciliationResult from Phase 10-19
-- Output: Feature vectors, metadata, validation status

CREATE TABLE IF NOT EXISTS task_semantic_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Packet identity (from Phase 17 output)
  packet_key VARCHAR(255) NOT NULL UNIQUE,
  source_ref VARCHAR(512) NOT NULL,
  feature_id VARCHAR(255) NOT NULL,
  feature_label VARCHAR(512) NOT NULL,
  alias_id VARCHAR(255) NOT NULL,

  -- Extracted features (JSON JSONB for flexibility during Phase 17C wiring)
  qdrant_score REAL NOT NULL,
  cluster_score REAL NOT NULL,
  topological_score REAL NOT NULL,
  fusion_score REAL NOT NULL,

  -- Metadata object (JSONB: authority_score, member_count, summary_length, etc.)
  metadata JSONB NOT NULL,

  -- Semantic vector (768-dim, optional, Phase 17C)
  semantic_vector vector(768),

  -- Validation status and error tracking
  validation_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,

  -- Audit columns
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Index for fast packet_key lookup
  CONSTRAINT packet_key_format CHECK (packet_key ~ '^[a-zA-Z0-9_:.-]+$')
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_packet_key
  ON task_semantic_packets(packet_key);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_source_ref
  ON task_semantic_packets(source_ref);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_feature_id
  ON task_semantic_packets(feature_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_alias_id
  ON task_semantic_packets(alias_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_validation_status
  ON task_semantic_packets(validation_status);

-- HNSW index for semantic vector similarity (Phase 17C)
-- Note: This will be created after embeddings are populated
-- CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_semantic_vector
--   ON task_semantic_packets USING hnsw (semantic_vector vector_cosine_ops)
--   WITH (m=16, ef_construction=64);

-- GIN index on metadata for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_metadata
  ON task_semantic_packets USING GIN(metadata);
