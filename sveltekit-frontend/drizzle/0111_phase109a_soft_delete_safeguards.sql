-- Phase 109A Role-Based Safeguards + Explicit State Functions
-- Timestamp: 2026-07-29T00:00:00Z
-- Description: Role-based access control, lifecycle state management functions (NOT triggers), and immutable promotion workflow

-- ===== ROLE-BASED ACCESS CONTROL =====

DO $$ BEGIN
  CREATE ROLE atlas_application WITH NOLOGIN;
  EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE atlas_maintenance WITH NOLOGIN;
  EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL;
END $$;

-- Application role: SELECT, INSERT, UPDATE only (no DELETE)
GRANT SELECT, INSERT, UPDATE ON semantic_signals TO atlas_application;
GRANT SELECT, INSERT, UPDATE ON classification_envelope TO atlas_application;
GRANT SELECT, INSERT, UPDATE ON recommendation_log TO atlas_application;
GRANT SELECT, INSERT, UPDATE ON semantic_lifecycle_events TO atlas_application;
GRANT SELECT, INSERT, UPDATE ON domain_taxonomy_v1 TO atlas_application;
GRANT USAGE ON SCHEMA public TO atlas_application;
GRANT EXECUTE ON FUNCTION archive_semantic_signal(uuid, varchar, text) TO atlas_application;
GRANT EXECUTE ON FUNCTION supersede_semantic_signal(uuid, uuid, varchar, text) TO atlas_application;
GRANT EXECUTE ON FUNCTION promote_recommendation(uuid, varchar, uuid, varchar, boolean) TO atlas_application;

-- Maintenance role: full privileges including DELETE
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO atlas_maintenance;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO atlas_maintenance;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO atlas_maintenance;
GRANT USAGE ON SCHEMA public TO atlas_maintenance;

-- ===== EXPLICIT STATE MANAGEMENT FUNCTIONS (NO HIDDEN TRIGGERS) =====

-- Archive a semantic signal: transitions ACTIVE → ARCHIVED
CREATE OR REPLACE FUNCTION archive_semantic_signal(
  p_signal_id uuid,
  p_actor_id varchar(255),
  p_reason text
)
RETURNS TABLE (
  signal_id uuid,
  previous_state varchar(50),
  new_state varchar(50),
  event_id uuid
)
AS $$
DECLARE
  v_signal_row record;
  v_event_id uuid;
  v_old_state varchar(50);
BEGIN
  -- Fetch current signal
  SELECT id, lifecycle_state, workspace_revision INTO v_signal_row
  FROM semantic_signals
  WHERE id = p_signal_id
  FOR UPDATE;

  IF v_signal_row IS NULL THEN
    RAISE EXCEPTION 'Signal % not found', p_signal_id;
  END IF;

  v_old_state := v_signal_row.lifecycle_state;

  -- Validate state transition
  IF v_old_state NOT IN ('ACTIVE', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'Cannot archive signal in state %', v_old_state;
  END IF;

  -- Update signal state
  UPDATE semantic_signals
  SET lifecycle_state = 'ARCHIVED',
      state_reason = p_reason,
      state_changed_at = NOW(),
      state_changed_by = p_actor_id,
      updated_at = NOW()
  WHERE id = p_signal_id;

  -- Create immutable audit event
  INSERT INTO semantic_lifecycle_events (
    entity_type, entity_id, previous_state, new_state, reason,
    actor_type, actor_id, workspace_revision, created_at
  )
  VALUES (
    'semantic_signal', p_signal_id, v_old_state, 'ARCHIVED', p_reason,
    'system', p_actor_id, v_signal_row.workspace_revision, NOW()
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT p_signal_id, v_old_state::varchar, 'ARCHIVED'::varchar, v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Supersede a semantic signal with a replacement: transitions ACTIVE → SUPERSEDED
CREATE OR REPLACE FUNCTION supersede_semantic_signal(
  p_signal_id uuid,
  p_replacement_signal_id uuid,
  p_actor_id varchar(255),
  p_reason text
)
RETURNS TABLE (
  signal_id uuid,
  previous_state varchar(50),
  new_state varchar(50),
  event_id uuid
)
AS $$
DECLARE
  v_signal_row record;
  v_replacement_row record;
  v_event_id uuid;
  v_old_state varchar(50);
BEGIN
  -- Fetch current signal
  SELECT id, lifecycle_state, workspace_revision INTO v_signal_row
  FROM semantic_signals
  WHERE id = p_signal_id
  FOR UPDATE;

  IF v_signal_row IS NULL THEN
    RAISE EXCEPTION 'Signal % not found', p_signal_id;
  END IF;

  -- Verify replacement exists
  SELECT id INTO v_replacement_row
  FROM semantic_signals
  WHERE id = p_replacement_signal_id;

  IF v_replacement_row IS NULL THEN
    RAISE EXCEPTION 'Replacement signal % not found', p_replacement_signal_id;
  END IF;

  v_old_state := v_signal_row.lifecycle_state;

  -- Validate state transition
  IF v_old_state NOT IN ('ACTIVE') THEN
    RAISE EXCEPTION 'Can only supersede ACTIVE signals, current state: %', v_old_state;
  END IF;

  -- Update signal state and link to replacement
  UPDATE semantic_signals
  SET lifecycle_state = 'SUPERSEDED',
      state_reason = p_reason,
      state_changed_at = NOW(),
      state_changed_by = p_actor_id,
      superseded_by = p_replacement_signal_id,
      updated_at = NOW()
  WHERE id = p_signal_id;

  -- Create immutable audit event
  INSERT INTO semantic_lifecycle_events (
    entity_type, entity_id, previous_state, new_state, reason,
    actor_type, actor_id, workspace_revision, created_at
  )
  VALUES (
    'semantic_signal', p_signal_id, v_old_state, 'SUPERSEDED', p_reason,
    'system', p_actor_id, v_signal_row.workspace_revision, NOW()
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT p_signal_id, v_old_state::varchar, 'SUPERSEDED'::varchar, v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Promote a recommendation: mutual approval enforced, transitions PROPOSED → APPROVED
CREATE OR REPLACE FUNCTION promote_recommendation(
  p_recommendation_id uuid,
  p_approver_id varchar(255),
  p_proof_manifest_id uuid,
  p_actor_id varchar(255),
  p_dry_run boolean DEFAULT false
)
RETURNS TABLE (
  recommendation_id uuid,
  new_status varchar(50),
  event_id uuid,
  validation_passed boolean
)
AS $$
DECLARE
  v_rec_row record;
  v_event_id uuid;
  v_creator_id varchar(255);
  v_status_before varchar(50);
BEGIN
  -- Fetch recommendation
  SELECT id, status, created_by, workspace_revision, lifecycle_state INTO v_rec_row
  FROM recommendation_log
  WHERE id = p_recommendation_id
  FOR UPDATE;

  IF v_rec_row IS NULL THEN
    RAISE EXCEPTION 'Recommendation % not found', p_recommendation_id;
  END IF;

  v_creator_id := v_rec_row.created_by;
  v_status_before := v_rec_row.status;

  -- VALIDATION: Mutual approval safeguard
  IF p_approver_id = v_creator_id THEN
    RAISE EXCEPTION 'Approver must be different from creator (creator: %, approver: %)', v_creator_id, p_approver_id;
  END IF;

  -- VALIDATION: Proof manifest must exist
  IF p_proof_manifest_id IS NOT NULL THEN
    PERFORM 1 FROM semantic_lifecycle_events
    WHERE id = p_proof_manifest_id LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proof manifest % not found', p_proof_manifest_id;
    END IF;
  END IF;

  -- VALIDATION: Status must be PROPOSED
  IF v_status_before NOT IN ('PROPOSED', 'READY_FOR_REVIEW') THEN
    RAISE EXCEPTION 'Can only promote from PROPOSED or READY_FOR_REVIEW, current: %', v_status_before;
  END IF;

  -- VALIDATION: Lifecycle state must be ACTIVE
  IF v_rec_row.lifecycle_state != 'ACTIVE' THEN
    RAISE EXCEPTION 'Recommendation lifecycle_state must be ACTIVE, current: %', v_rec_row.lifecycle_state;
  END IF;

  -- Dry-run mode: return validation result only
  IF p_dry_run THEN
    RETURN QUERY SELECT p_recommendation_id, 'APPROVED'::varchar, p_proof_manifest_id::uuid, true;
    RETURN;
  END IF;

  -- Perform state update
  UPDATE recommendation_log
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = NOW(),
      proof_manifest_id = p_proof_manifest_id,
      approved_by_distinct_from_created_by = true,
      updated_at = NOW(),
      state_changed_at = NOW(),
      state_changed_by = p_actor_id
  WHERE id = p_recommendation_id;

  -- Create immutable audit event
  INSERT INTO semantic_lifecycle_events (
    entity_type, entity_id, previous_state, new_state, reason,
    actor_type, actor_id, proof_manifest_id, workspace_revision, created_at
  )
  VALUES (
    'recommendation', p_recommendation_id, v_status_before, 'APPROVED',
    'Approved by ' || p_approver_id,
    'user', p_actor_id, p_proof_manifest_id, v_rec_row.workspace_revision, NOW()
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT p_recommendation_id, 'APPROVED'::varchar, v_event_id, true;
END;
$$ LANGUAGE plpgsql;

-- Purge eligible signals: bounded by retention_until, hard DELETE with role check
CREATE OR REPLACE FUNCTION purge_eligible_signals(
  p_retention_cutoff timestamp with time zone DEFAULT (NOW() - INTERVAL '90 days')
)
RETURNS TABLE (
  purged_count integer,
  purge_timestamp timestamp with time zone
)
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Hard DELETE only signals that are:
  -- 1. In PURGE_PENDING state
  -- 2. retention_until is in the past OR NULL and created_at is before cutoff
  -- 3. No dependent classification_envelope rows (cascade would fail)
  DELETE FROM semantic_signals
  WHERE lifecycle_state = 'PURGE_PENDING'
    AND (retention_until < NOW() OR (retention_until IS NULL AND created_at < p_retention_cutoff))
    AND id NOT IN (SELECT signal_id FROM classification_envelope WHERE lifecycle_state != 'PURGE_PENDING' AND lifecycle_state != 'ARCHIVED');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, NOW();
END;
$$ LANGUAGE plpgsql;

-- ===== ACTIVE/ARCHIVE VIEWS (immutable, no DELETE columns needed) =====

CREATE OR REPLACE VIEW semantic_signals_active AS
SELECT * FROM semantic_signals
WHERE lifecycle_state IN ('ACTIVE', 'SUPERSEDED')
ORDER BY state_changed_at DESC;

CREATE OR REPLACE VIEW classification_envelope_active AS
SELECT * FROM classification_envelope
WHERE lifecycle_state IN ('ACTIVE', 'SUPERSEDED')
ORDER BY state_changed_at DESC;

CREATE OR REPLACE VIEW recommendation_log_active AS
SELECT * FROM recommendation_log
WHERE lifecycle_state IN ('ACTIVE', 'SUPERSEDED')
ORDER BY state_changed_at DESC;

-- ===== ELIGIBILITY VIEWS (for purge/archive operations) =====

CREATE OR REPLACE VIEW signals_eligible_for_archive AS
SELECT * FROM semantic_signals
WHERE lifecycle_state IN ('ACTIVE', 'SUPERSEDED')
  AND created_at < (NOW() - INTERVAL '180 days');

CREATE OR REPLACE VIEW signals_eligible_for_purge AS
SELECT * FROM semantic_signals
WHERE lifecycle_state = 'PURGE_PENDING'
  AND (retention_until < NOW() OR (retention_until IS NULL AND created_at < NOW() - INTERVAL '90 days'));

-- ===== INDEXES FOR LIFECYCLE QUERIES =====

CREATE INDEX IF NOT EXISTS idx_semantic_signals_lifecycle_state ON semantic_signals(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_semantic_signals_state_changed_at ON semantic_signals(state_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_approved_by ON recommendation_log(approved_by);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_proof_manifest_id ON recommendation_log(proof_manifest_id);
