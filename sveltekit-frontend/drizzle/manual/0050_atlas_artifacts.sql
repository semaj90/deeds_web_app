-- Phase 85a: Artifact Registry (Universal Derived Registry)
-- Every generated thing becomes one entry: summary, embedding, latent64, etc.
-- Makes everything queryable and traceable.

CREATE TABLE IF NOT EXISTS atlas_artifacts (
  artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Packet identity (immutable link)
  packet_key varchar(255) NOT NULL,
  source_ref varchar(512) NOT NULL,
  feature_id varchar(255),

  -- What type of artifact
  artifact_type varchar(50) NOT NULL,

  -- Content hash (for dedup)
  content_hash varchar(64),

  -- Generator info
  generator varchar(100) NOT NULL,
  generator_version varchar(100) NOT NULL,
  generator_config text,

  -- Storage backend
  storage_backend varchar(50) NOT NULL,
  storage_location text,

  -- GAN validation results
  gan_validated timestamp with time zone,
  gan_validation_score real,

  -- Superseded artifact (if regenerated)
  supersedes_artifact_id uuid,

  -- Status
  status varchar(50) NOT NULL DEFAULT 'generated',

  -- Trace ID for linking to agent runs
  trace_id uuid,

  -- Git commit (immutable reference)
  git_commit varchar(40),

  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_artifacts_packet_key ON atlas_artifacts(packet_key);
CREATE INDEX IF NOT EXISTS idx_artifacts_source_ref ON atlas_artifacts(source_ref);
CREATE INDEX IF NOT EXISTS idx_artifacts_feature_id ON atlas_artifacts(feature_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_generator ON atlas_artifacts(generator);
CREATE INDEX IF NOT EXISTS idx_artifacts_generator_version ON atlas_artifacts(generator_version);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON atlas_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON atlas_artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_supersedes ON atlas_artifacts(supersedes_artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON atlas_artifacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_gan_validated ON atlas_artifacts(gan_validated);
CREATE INDEX IF NOT EXISTS idx_artifacts_generator_status ON atlas_artifacts(generator, status);
