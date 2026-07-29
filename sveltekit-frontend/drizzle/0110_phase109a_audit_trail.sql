-- Phase 109A Audit Trail Extensions
-- Timestamp: 2026-07-29T00:00:00Z
-- Description: Add append-only lifecycle events and audit triggers for semantic signals

-- ===== APPEND-ONLY LIFECYCLE EVENTS TABLE =====

CREATE TABLE IF NOT EXISTS semantic_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity identity
  entity_type VARCHAR(50) NOT NULL,  -- 'semantic_signal', 'classification_envelope', 'recommendation'
  entity_id UUID NOT NULL,

  -- State transition
  previous_state VARCHAR(50),
  new_state VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,

  -- Actor identity
  actor_type VARCHAR(50) NOT NULL,  -- 'user', 'system', 'agent'
  actor_id TEXT NOT NULL,

  -- Audit trail linkage
  run_id UUID,                     -- Background job/workflow ID
  proof_manifest_id UUID,          -- Validation evidence reference
  workspace_revision TEXT NOT NULL,

  -- Immutable timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT must_have_state_change CHECK (previous_state IS DISTINCT FROM new_state),
  CONSTRAINT lifecycle_state_valid CHECK (new_state IN (
    'ACTIVE', 'SUPERSEDED', 'RETRACTED', 'ARCHIVED', 'PURGE_PENDING', 'PURGED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_entity_id ON semantic_lifecycle_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_created_at ON semantic_lifecycle_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_actor_id ON semantic_lifecycle_events(actor_id);

-- ===== AUDIT TRAIL COLUMNS =====

ALTER TABLE semantic_signals
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

ALTER TABLE classification_envelope
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

ALTER TABLE recommendation_log
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- ===== SAFE AUDIT TRIGGERS (timestamp only, no hidden state changes) =====

CREATE OR REPLACE FUNCTION update_semantic_signals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = COALESCE(CURRENT_USER, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS semantic_signals_update_timestamp ON semantic_signals;
CREATE TRIGGER semantic_signals_update_timestamp
BEFORE UPDATE ON semantic_signals
FOR EACH ROW
EXECUTE FUNCTION update_semantic_signals_timestamp();

-- ===== CLASSIFICATION ENVELOPE AUDIT TRAIL =====

CREATE OR REPLACE FUNCTION update_classification_envelope_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = COALESCE(CURRENT_USER, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS classification_envelope_update_timestamp ON classification_envelope;
CREATE TRIGGER classification_envelope_update_timestamp
BEFORE UPDATE ON classification_envelope
FOR EACH ROW
EXECUTE FUNCTION update_classification_envelope_timestamp();

-- ===== RECOMMENDATION LOG AUDIT TRAIL =====

CREATE OR REPLACE FUNCTION update_recommendation_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = COALESCE(CURRENT_USER, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recommendation_log_update_timestamp ON recommendation_log;
CREATE TRIGGER recommendation_log_update_timestamp
BEFORE UPDATE ON recommendation_log
FOR EACH ROW
EXECUTE FUNCTION update_recommendation_log_timestamp();

-- ===== AUDIT VIEWS =====

CREATE OR REPLACE VIEW semantic_signals_audit AS
SELECT
  id,
  subject_id,
  workspace_id,
  signal_type,
  producer,
  lifecycle_state,
  state_reason,
  created_at,
  created_by,
  updated_at,
  updated_by,
  CASE
    WHEN state_changed_at > created_at THEN 'MODIFIED'
    ELSE 'CREATED'
  END as status
FROM semantic_signals
ORDER BY state_changed_at DESC;

CREATE OR REPLACE VIEW classification_envelope_audit AS
SELECT
  id,
  signal_id,
  subject_id,
  workspace_id,
  status,
  lifecycle_state,
  version,
  created_at,
  created_by,
  updated_at,
  updated_by,
  validated_at,
  validated_by,
  CASE
    WHEN updated_at > created_at THEN 'MODIFIED'
    ELSE 'CREATED'
  END as change_status
FROM classification_envelope
ORDER BY updated_at DESC;

CREATE OR REPLACE VIEW recommendation_log_audit AS
SELECT
  id,
  subject_id,
  workspace_id,
  status,
  lifecycle_state,
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

-- ===== LIFECYCLE HISTORY VIEW =====

CREATE OR REPLACE VIEW semantic_signal_history AS
SELECT
  s.id,
  s.subject_id,
  s.workspace_id,
  s.signal_type,
  s.producer,
  s.lifecycle_state,
  s.state_reason,
  s.state_changed_at,
  s.state_changed_by,
  s.superseded_by,
  e.created_at as event_created_at,
  e.previous_state,
  e.new_state,
  e.reason as event_reason,
  e.actor_type,
  e.actor_id
FROM semantic_signals s
LEFT JOIN semantic_lifecycle_events e ON e.entity_id = s.id
ORDER BY e.created_at DESC;
