-- Phase 109A Soft-Delete Safeguards
-- Timestamp: 2026-07-29T00:00:00Z
-- Description: Add soft-delete columns and audit logging for deletion safety

-- ===== DELETION AUDIT TABLE =====

CREATE TABLE IF NOT EXISTS semantic_signal_deletions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  signal_id uuid NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_by VARCHAR(255),
  reason_code VARCHAR(50), -- 'manual', 'cascade', 'retention_policy', 'user_request'
  envelope_count_deleted integer DEFAULT 0, -- How many classification_envelopes cascaded
  recovery_attempted boolean DEFAULT false,
  recovery_attempted_at TIMESTAMP WITH TIME ZONE,
  recovery_attempted_by VARCHAR(255),
  CONSTRAINT fk_deletion_audit_signal FOREIGN KEY (signal_id) REFERENCES semantic_signals(id) ON DELETE SET NULL
);

CREATE INDEX idx_semantic_signal_deletions_signal_id ON semantic_signal_deletions(signal_id);
CREATE INDEX idx_semantic_signal_deletions_deleted_at ON semantic_signal_deletions(deleted_at DESC);

-- ===== SOFT-DELETE COLUMNS =====

ALTER TABLE semantic_signals
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

ALTER TABLE classification_envelope
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

ALTER TABLE recommendation_log
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

-- ===== SOFT-DELETE FUNCTION =====

CREATE OR REPLACE FUNCTION soft_delete_semantic_signal(
  p_signal_id uuid,
  p_deleted_by VARCHAR(255),
  p_reason_code VARCHAR(50) DEFAULT 'manual'
)
RETURNS TABLE(
  deleted_signal_count int,
  deleted_envelope_count int,
  audit_id uuid
)
AS $$
DECLARE
  v_envelope_count int;
  v_audit_id uuid;
BEGIN
  -- Mark signal as deleted
  UPDATE semantic_signals
  SET deleted_at = NOW(),
      deleted_by = p_deleted_by
  WHERE id = p_signal_id AND deleted_at IS NULL;

  -- Mark dependent envelopes as deleted (soft cascade)
  UPDATE classification_envelope
  SET deleted_at = NOW(),
      deleted_by = p_deleted_by
  WHERE signal_id = p_signal_id AND deleted_at IS NULL;

  GET DIAGNOSTICS v_envelope_count = ROW_COUNT;

  -- Mark dependent recommendations as deleted (optional, data cleanup)
  UPDATE recommendation_log
  SET deleted_at = NOW(),
      deleted_by = p_deleted_by
  WHERE signal_id = p_signal_id AND deleted_at IS NULL;

  -- Log deletion to audit table
  INSERT INTO semantic_signal_deletions (signal_id, deleted_by, reason_code, envelope_count_deleted)
  VALUES (p_signal_id, p_deleted_by, p_reason_code, v_envelope_count)
  RETURNING id INTO v_audit_id;

  -- Return counts
  RETURN QUERY SELECT 1::int, v_envelope_count::int, v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- ===== RECOVERY FUNCTION =====

CREATE OR REPLACE FUNCTION recover_semantic_signal(
  p_signal_id uuid,
  p_recovered_by VARCHAR(255)
)
RETURNS TABLE(
  recovered_signal_count int,
  recovered_envelope_count int,
  recovered_recommendation_count int
)
AS $$
DECLARE
  v_envelope_count int;
  v_recommendation_count int;
BEGIN
  -- Recover signal
  UPDATE semantic_signals
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_signal_id AND deleted_at IS NOT NULL;

  -- Recover dependent envelopes
  UPDATE classification_envelope
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE signal_id = p_signal_id AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS v_envelope_count = ROW_COUNT;

  -- Recover dependent recommendations
  UPDATE recommendation_log
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE signal_id = p_signal_id AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS v_recommendation_count = ROW_COUNT;

  -- Log recovery attempt
  UPDATE semantic_signal_deletions
  SET recovery_attempted = true,
      recovery_attempted_at = NOW(),
      recovery_attempted_by = p_recovered_by
  WHERE signal_id = p_signal_id
  ORDER BY deleted_at DESC
  LIMIT 1;

  RETURN QUERY SELECT 1::int, v_envelope_count::int, v_recommendation_count::int;
END;
$$ LANGUAGE plpgsql;

-- ===== SOFT-DELETE VIEWS (exclude deleted rows) =====

CREATE OR REPLACE VIEW semantic_signals_active AS
SELECT * FROM semantic_signals
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

CREATE OR REPLACE VIEW classification_envelope_active AS
SELECT * FROM classification_envelope
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

CREATE OR REPLACE VIEW recommendation_log_active AS
SELECT * FROM recommendation_log
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

-- ===== DELETION HISTORY VIEW =====

CREATE OR REPLACE VIEW semantic_signal_deletion_history AS
SELECT
  d.id as deletion_id,
  d.signal_id,
  d.deleted_at,
  d.deleted_by,
  d.reason_code,
  d.envelope_count_deleted,
  d.recovery_attempted,
  d.recovery_attempted_at,
  d.recovery_attempted_by,
  CASE
    WHEN d.recovery_attempted THEN 'RECOVERED'
    WHEN d.deleted_at > NOW() - INTERVAL '30 days' THEN 'RECENT_DELETION'
    ELSE 'ARCHIVED'
  END as status
FROM semantic_signal_deletions d
ORDER BY d.deleted_at DESC;

-- ===== INDEXES FOR SOFT-DELETE QUERIES =====

CREATE INDEX IF NOT EXISTS idx_semantic_signals_deleted_at ON semantic_signals(deleted_at);
CREATE INDEX IF NOT EXISTS idx_semantic_signals_not_deleted ON semantic_signals(created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_classification_envelope_deleted_at ON classification_envelope(deleted_at);
CREATE INDEX IF NOT EXISTS idx_classification_envelope_not_deleted ON classification_envelope(created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recommendation_log_deleted_at ON recommendation_log(deleted_at);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_not_deleted ON recommendation_log(created_at DESC) WHERE deleted_at IS NULL;
