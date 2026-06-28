-- PHASE 85a: Artifact Registry (Universal Derived Registry)
-- Every generated thing becomes one entry with: artifact_id, packet_key, generator, status, supersedes

CREATE TABLE IF NOT EXISTS atlas_artifacts (
  artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (immutable)
  packet_key VARCHAR(255) NOT NULL,
  source_ref VARCHAR(512) NOT NULL,
  feature_id VARCHAR(255),

  -- Artifact type
  artifact_type VARCHAR(50) NOT NULL
    CHECK (artifact_type IN (
      'summary', 'embedding', 'latent64', 'som_cell', 'redis_cache',
      'markdown', 'qdrant_payload', 'gemma4_prompt', 'gemma4_output',
      'feature_labels', 'gan_report', 'benchmark', 'trace'
    )),

  -- Content hash (for dedup)
  content_hash VARCHAR(64),

  -- Generator info
  generator VARCHAR(100) NOT NULL
    CHECK (generator IN (
      'Gemma4', 'EmbeddingGemma', 'AutoEncoder', 'SOM', 'KarpathyBlender',
      'GANValidator', 'LangExtract', 'MarkdownGenerator', 'TraceExporter'
    )),

  generator_version VARCHAR(100) NOT NULL,

  -- Generator config (JSON)
  generator_config TEXT,

  -- Storage backend
  storage_backend VARCHAR(50) NOT NULL
    CHECK (storage_backend IN ('filesystem', 'qdrant', 'redis', 'postgres_jsonb', 'seaweedfs')),

  storage_location TEXT,

  -- GAN validation
  gan_validated TIMESTAMP,
  gan_validation_score REAL,

  -- Supersession tracking
  supersedes_artifact_id UUID,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'validated', 'superseded', 'failed')),

  -- Traceability
  trace_id UUID,
  git_commit VARCHAR(40),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Identity indexes
CREATE INDEX idx_artifacts_packet_key ON atlas_artifacts(packet_key);
CREATE INDEX idx_artifacts_source_ref ON atlas_artifacts(source_ref);
CREATE INDEX idx_artifacts_feature_id ON atlas_artifacts(feature_id);

-- Generator indexes
CREATE INDEX idx_artifacts_generator ON atlas_artifacts(generator);
CREATE INDEX idx_artifacts_generator_version ON atlas_artifacts(generator_version);

-- Tracking
CREATE INDEX idx_artifacts_type ON atlas_artifacts(artifact_type);
CREATE INDEX idx_artifacts_status ON atlas_artifacts(status);
CREATE INDEX idx_artifacts_supersedes ON atlas_artifacts(supersedes_artifact_id);

-- Time-based queries
CREATE INDEX idx_artifacts_created_at ON atlas_artifacts(created_at DESC);
CREATE INDEX idx_artifacts_gan_validated ON atlas_artifacts(gan_validated DESC);

-- Composite for common queries
CREATE INDEX idx_artifacts_generator_status ON atlas_artifacts(generator, status);

-- Regeneration query: "Find all summaries superseded by newer ones"
CREATE INDEX idx_artifacts_generator_packet_status ON atlas_artifacts(generator, packet_key, status);