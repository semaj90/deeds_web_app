-- Migration: 20241211000002_create_enhanced_evidence_table
-- Up
CREATE TABLE IF NOT EXISTS evidence (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  evidence_type VARCHAR(50) NOT NULL CHECK (evidence_type IN ('document', 'photo', 'video', 'audio', 'physical', 'digital')),
  file_path TEXT,
  file_size BIGINT,
  file_type TEXT,
  hash_sha256 TEXT,
  chain_of_custody JSONB DEFAULT '[]',
  location_found TEXT,
  date_collected DATE,
  collected_by INTEGER,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  ai_summary TEXT,
  vector_embedding vector(384),
  ocr_text TEXT,
  analysis_status VARCHAR(20) DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_created_by ON evidence(created_by);
CREATE INDEX IF NOT EXISTS idx_evidence_analysis_status ON evidence(analysis_status);
CREATE INDEX IF NOT EXISTS idx_evidence_updated_at ON evidence(updated_at);
CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence(hash_sha256);

-- Auto-update trigger for evidence
CREATE TRIGGER update_evidence_updated_at BEFORE UPDATE ON evidence
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Down
DROP TRIGGER IF EXISTS update_evidence_updated_at ON evidence;
DROP TABLE IF EXISTS evidence;