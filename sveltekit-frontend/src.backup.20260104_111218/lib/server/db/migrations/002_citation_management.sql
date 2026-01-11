-- Phase 2: Citation Management Schema
-- Sprint S-A: Citation Management

-- Create saved_citations table
CREATE TABLE IF NOT EXISTS saved_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  statute_code VARCHAR NOT NULL,
  statute_title VARCHAR,
  jurisdiction VARCHAR,
  severity VARCHAR,
  year INT,
  source_type VARCHAR NOT NULL DEFAULT 'manual', -- 'manual' | 'auto_extracted'
  highlighted_text TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for saved_citations
CREATE INDEX IF NOT EXISTS idx_saved_citations_user ON saved_citations(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_citations_case ON saved_citations(case_id);
CREATE INDEX IF NOT EXISTS idx_saved_citations_statute ON saved_citations(statute_code);
CREATE INDEX IF NOT EXISTS idx_saved_citations_source_type ON saved_citations(source_type);

-- Create statute_search_history table
CREATE TABLE IF NOT EXISTS statute_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query VARCHAR NOT NULL,
  statute_code VARCHAR,
  results_count INT,
  searched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for statute_search_history
CREATE INDEX IF NOT EXISTS idx_search_history_user ON statute_search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_statute ON statute_search_history(statute_code);
CREATE INDEX IF NOT EXISTS idx_search_history_query ON statute_search_history(query);

-- Add trigger to update updated_at on saved_citations
CREATE OR REPLACE FUNCTION update_saved_citations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_saved_citations_updated_at ON saved_citations;
CREATE TRIGGER trigger_update_saved_citations_updated_at
BEFORE UPDATE ON saved_citations
FOR EACH ROW
EXECUTE FUNCTION update_saved_citations_updated_at();
