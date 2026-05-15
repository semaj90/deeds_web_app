-- Migration: 20241211000001_create_enhanced_cases_table
-- Up
CREATE TABLE IF NOT EXISTS cases (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  case_number TEXT UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed', 'archived')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to INTEGER,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  ai_summary TEXT,
  vector_embedding vector(384)
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_priority ON cases(priority);
CREATE INDEX IF NOT EXISTS idx_cases_created_by ON cases(created_by);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON cases(updated_at);
CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Down
DROP TRIGGER IF EXISTS update_cases_updated_at ON cases;
DROP FUNCTION IF EXISTS update_updated_at_column;
DROP TABLE IF EXISTS cases;
