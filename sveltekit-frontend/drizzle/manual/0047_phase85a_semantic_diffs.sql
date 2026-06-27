-- PHASE 85a: Semantic Diff Tracking Table
-- Logs similarity scores between old and new summaries to gate regenerations

CREATE TABLE IF NOT EXISTS atlas_semantic_diffs (
  diff_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key VARCHAR(255) NOT NULL,
  source_ref VARCHAR(512) NOT NULL,

  -- Cosine similarity (0.0 to 1.0)
  similarity REAL NOT NULL,

  -- Recommendation: skip | metadata_only | regenerate | gan_review | full_regeneration
  recommendation VARCHAR(50) NOT NULL
    CHECK (recommendation IN ('skip', 'metadata_only', 'regenerate', 'gan_review', 'full_regeneration')),

  -- Action taken (may differ from recommendation)
  action_taken VARCHAR(50)
    CHECK (action_taken IS NULL OR action_taken IN ('skip', 'metadata_only', 'regenerate', 'gan_review', 'full_regeneration')),

  -- Cost savings estimate (0-100%, percentage of regeneration cost avoided)
  regeneration_cost_saved REAL,

  -- Link to agent_runs trace
  trace_id UUID,

  -- Notes
  notes TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_semantic_diffs_packet_key ON atlas_semantic_diffs(packet_key);
CREATE INDEX idx_semantic_diffs_source_ref ON atlas_semantic_diffs(source_ref);
CREATE INDEX idx_semantic_diffs_recommendation ON atlas_semantic_diffs(recommendation);
CREATE INDEX idx_semantic_diffs_created_at ON atlas_semantic_diffs(created_at DESC);

-- Composite for daily/hourly reporting
CREATE INDEX idx_semantic_diffs_created_recommendation ON atlas_semantic_diffs(created_at DESC, recommendation);
