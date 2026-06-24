-- Deep Research Reports Table
-- Persists Gemma4 synthesis results from /api/analytics/deep-research and related routes

CREATE TABLE IF NOT EXISTS deep_research_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  report_type VARCHAR(50) NOT NULL DEFAULT 'full',
  model_used VARCHAR(100) DEFAULT 'gemma4-rotorquant:latest',
  markdown_content TEXT,
  citations JSONB,
  recommendations JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deep_research_reports_user_id
  ON deep_research_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_deep_research_reports_created_at
  ON deep_research_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deep_research_reports_model
  ON deep_research_reports(model_used);

CREATE INDEX IF NOT EXISTS idx_deep_research_reports_query_gin
  ON deep_research_reports USING GIN(citations, recommendations);
