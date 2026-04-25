/**
 * AI Fix Runs & Events Schema
 * Persists fix automation results for agent memory + learning
 *
 * Designed for later pgvector integration (fix recommendations as vectors)
 */

-- ai_fix_runs: top-level runs (when did we analyze/fix?)
CREATE TABLE IF NOT EXISTS ai_fix_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  git_sha VARCHAR(40),
  command VARCHAR(255) NOT NULL,  -- "analyze-errors", "batch-fixer --tier 1", etc
  status VARCHAR(20) NOT NULL,    -- "running", "completed", "failed"
  error_message TEXT,
  summary JSONB,                   -- { totalErrors: 123, applied: 45, ... }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_fix_runs_status ON ai_fix_runs(status);
CREATE INDEX idx_ai_fix_runs_started_at ON ai_fix_runs(started_at DESC);

-- ai_fix_events: individual errors detected + how they were handled
CREATE TABLE IF NOT EXISTS ai_fix_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ai_fix_runs(id) ON DELETE CASCADE,
  tool VARCHAR(50) NOT NULL,       -- "svelte-check", "tsc", "eslint"
  file VARCHAR(512) NOT NULL,
  line INT NOT NULL,
  col INT,
  code VARCHAR(100),               -- error code (e.g., "TS2828", "non_reactive_update")
  message TEXT,
  category VARCHAR(50),            -- "import-type-misuse", "async-function", etc
  fingerprint VARCHAR(20) UNIQUE,  -- short hash for dedup
  severity VARCHAR(20),            -- "error", "warning"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_fix_events_run_id ON ai_fix_events(run_id);
CREATE INDEX idx_ai_fix_events_file ON ai_fix_events(file);
CREATE INDEX idx_ai_fix_events_category ON ai_fix_events(category);
CREATE INDEX idx_ai_fix_events_fingerprint ON ai_fix_events(fingerprint);

-- ai_fix_patches: specific fixes tried (what worked?)
CREATE TABLE IF NOT EXISTS ai_fix_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ai_fix_runs(id) ON DELETE CASCADE,
  event_id UUID REFERENCES ai_fix_events(id) ON DELETE SET NULL,
  file VARCHAR(512) NOT NULL,
  line_start INT,
  line_end INT,
  diff TEXT NOT NULL,              -- unified diff
  applied BOOLEAN DEFAULT FALSE,
  result VARCHAR(50),              -- "success", "failed", "skipped"
  error_message TEXT,
  confidence FLOAT DEFAULT 0.5,    -- 0.0-1.0 how confident was the fix?
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_fix_patches_run_id ON ai_fix_patches(run_id);
CREATE INDEX idx_ai_fix_patches_file ON ai_fix_patches(file);
CREATE INDEX idx_ai_fix_patches_applied ON ai_fix_patches(applied);

-- Evidence ingest jobs (linked to evidence pipeline)
CREATE TABLE IF NOT EXISTS evidence_ingest_jobs (
  id VARCHAR(100) PRIMARY KEY,
  case_id VARCHAR(100) NOT NULL,
  artifact_type VARCHAR(50) NOT NULL,  -- "document", "image", "audio", "video", "email"
  minio_key VARCHAR(512),
  status VARCHAR(50) NOT NULL,         -- "staged", "sanitizing", "embedding", "complete", "failed"
  hash_blake3 VARCHAR(64),              -- content hash for dedup
  file_size_bytes BIGINT,
  metadata JSONB,                       -- original metadata (before sanitize)
  sanitized_artifact_url VARCHAR(512),  -- clean version stored
  vector_id VARCHAR(100),               -- Qdrant collection ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_evidence_ingest_jobs_case_id ON evidence_ingest_jobs(case_id);
CREATE INDEX idx_evidence_ingest_jobs_status ON evidence_ingest_jobs(status);
CREATE INDEX idx_evidence_ingest_jobs_hash ON evidence_ingest_jobs(hash_blake3);

-- Case timeline entries (linked to evidence)
CREATE TABLE IF NOT EXISTS case_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,     -- "evidence-ingested", "analysis-complete", etc
  event_date DATE NOT NULL,
  description TEXT,
  evidence_job_id VARCHAR(100) REFERENCES evidence_ingest_jobs(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_case_timeline_case_id ON case_timeline(case_id);
CREATE INDEX idx_case_timeline_event_date ON case_timeline(event_date DESC);

-- Grant permissions (if using separate roles)
-- GRANT SELECT, INSERT ON ai_fix_runs TO "app_user";
-- GRANT SELECT, INSERT ON ai_fix_events TO "app_user";
-- GRANT SELECT, INSERT ON ai_fix_patches TO "app_user";
-- GRANT SELECT, INSERT ON evidence_ingest_jobs TO "app_user";
-- GRANT SELECT, INSERT ON case_timeline TO "app_user";
