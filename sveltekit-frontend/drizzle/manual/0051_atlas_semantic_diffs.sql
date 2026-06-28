-- Phase 85a: Semantic Diff Results Table
-- Logs every semantic diff comparison: old summary embedding vs new summary embedding.
-- Tracks which regenerations were skipped due to high similarity.

CREATE TABLE IF NOT EXISTS atlas_semantic_diffs (
  diff_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key varchar(255) NOT NULL,
  source_ref varchar(512) NOT NULL,

  -- Cosine similarity between old and new summary embeddings (0.0 to 1.0)
  similarity real NOT NULL,

  -- Recommendation: what action to take
  recommendation varchar(50) NOT NULL,

  -- What action was actually taken
  action_taken varchar(50),

  -- Estimated cost savings (0-100, percentage of regeneration cost avoided)
  regeneration_cost_saved real,

  -- Trace ID for linking to agent runs
  trace_id uuid,

  -- Notes
  notes text,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_semantic_diffs_packet_key ON atlas_semantic_diffs(packet_key);
CREATE INDEX IF NOT EXISTS idx_semantic_diffs_source_ref ON atlas_semantic_diffs(source_ref);
CREATE INDEX IF NOT EXISTS idx_semantic_diffs_recommendation ON atlas_semantic_diffs(recommendation);
CREATE INDEX IF NOT EXISTS idx_semantic_diffs_created_at ON atlas_semantic_diffs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_diffs_trace_id ON atlas_semantic_diffs(trace_id);
