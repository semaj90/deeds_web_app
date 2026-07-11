-- Phase 3.2: Execution Review System
-- Tracks proposal → execution → outcome → review decision cycle

CREATE TABLE IF NOT EXISTS execution_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL UNIQUE,
  trace_id UUID,

  -- Five evaluation gates
  tool_executed BOOLEAN NOT NULL DEFAULT false,
  proposal_matched BOOLEAN NOT NULL DEFAULT false,
  exit_code_valid BOOLEAN NOT NULL DEFAULT false,
  evidence_complete BOOLEAN NOT NULL DEFAULT false,
  file_modifications_allowed BOOLEAN NOT NULL DEFAULT true,

  -- Overall permission/decision
  permission_passed BOOLEAN NOT NULL DEFAULT false,
  decision VARCHAR(32) NOT NULL CHECK (decision IN ('continue', 'validate', 'repair', 'await_human', 'fail')),

  -- Review details
  issues JSONB DEFAULT '[]'::jsonb,
  evidence_refs JSONB DEFAULT '[]'::jsonb,
  recommendation TEXT,

  -- Timestamps
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (trace_id) REFERENCES trace_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_execution_reviews_execution_id ON execution_reviews(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_reviews_trace_id ON execution_reviews(trace_id);
CREATE INDEX IF NOT EXISTS idx_execution_reviews_decision ON execution_reviews(decision);
CREATE INDEX IF NOT EXISTS idx_execution_reviews_reviewed_at ON execution_reviews(reviewed_at DESC);
