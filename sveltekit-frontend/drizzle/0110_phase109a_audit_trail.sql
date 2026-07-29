-- Phase 109A Audit Trail Extensions
-- Timestamp: 2026-07-29T00:00:00Z
-- Description: Add audit trail columns and triggers for semantic signals and classification envelopes

-- ===== SEMANTIC SIGNALS AUDIT TRAIL =====

ALTER TABLE semantic_signals
ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Auto-update last_modified_at trigger
CREATE OR REPLACE FUNCTION update_semantic_signals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified_at = NOW();
  NEW.updated_by = COALESCE(NEW.created_by, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS semantic_signals_update_timestamp ON semantic_signals;
CREATE TRIGGER semantic_signals_update_timestamp
BEFORE UPDATE ON semantic_signals
FOR EACH ROW
EXECUTE FUNCTION update_semantic_signals_timestamp();

-- ===== CLASSIFICATION ENVELOPE AUDIT TRAIL =====

ALTER TABLE classification_envelope
ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Auto-update last_modified_at trigger
CREATE OR REPLACE FUNCTION update_classification_envelope_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified_at = NOW();
  NEW.updated_by = COALESCE(NEW.created_by, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS classification_envelope_update_timestamp ON classification_envelope;
CREATE TRIGGER classification_envelope_update_timestamp
BEFORE UPDATE ON classification_envelope
FOR EACH ROW
EXECUTE FUNCTION update_classification_envelope_timestamp();

-- ===== RECOMMENDATION LOG AUDIT TRAIL (already has created_by, add updated_by) =====

ALTER TABLE recommendation_log
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- Auto-update trigger for recommendation_log
CREATE OR REPLACE FUNCTION update_recommendation_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = COALESCE(NEW.approved_by, NEW.created_by, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recommendation_log_update_timestamp ON recommendation_log;
CREATE TRIGGER recommendation_log_update_timestamp
BEFORE UPDATE ON recommendation_log
FOR EACH ROW
EXECUTE FUNCTION update_recommendation_log_timestamp();

-- ===== AUDIT VIEW =====

CREATE OR REPLACE VIEW semantic_signals_audit AS
SELECT
  id,
  subject_id,
  workspace_id,
  signal_type,
  producer,
  evidence_confidence,
  created_at,
  created_by,
  last_modified_at,
  updated_by,
  CASE
    WHEN last_modified_at > created_at THEN 'MODIFIED'
    ELSE 'CREATED'
  END as status
FROM semantic_signals
ORDER BY last_modified_at DESC;

CREATE OR REPLACE VIEW classification_envelope_audit AS
SELECT
  id,
  signal_id,
  subject_id,
  workspace_id,
  status,
  version,
  created_at,
  created_by,
  last_modified_at,
  updated_by,
  validated_at,
  validated_by,
  CASE
    WHEN last_modified_at > created_at THEN 'MODIFIED'
    ELSE 'CREATED'
  END as change_status
FROM classification_envelope
ORDER BY last_modified_at DESC;

CREATE OR REPLACE VIEW recommendation_log_audit AS
SELECT
  id,
  subject_id,
  workspace_id,
  status,
  created_at,
  created_by,
  approved_at,
  approved_by,
  implemented_at,
  validated_at,
  updated_at,
  updated_by,
  validation_error
FROM recommendation_log
ORDER BY updated_at DESC;
