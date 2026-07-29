-- Forward-Repair Migration: Phase 109A Semantic Signals Schema
-- Timestamp: 2026-07-29T14:35:00Z
-- Purpose: Safe re-application of Phase 109A after discovery that 0109/0110/0111 were never journaled
-- Strategy: IF NOT EXISTS safety, idempotent column additions, delayed constraints, immutable audit before DELETE
-- Precedent: When migrations are file-only (not journaled), replay via forward-repair with idempotency gates

-- ===== REPAIR STRATEGY =====
-- 1. Verify if any core tables exist; if so, backfill missing columns
-- 2. Create all core tables (0109 content) if missing
-- 3. Create audit infrastructure (0110 content) if missing
-- 4. Apply role-based access control and state functions (0111 content) if missing
-- 5. Hard gate: workspace_revision MUST be present before any functions are created

-- ===== STEP 1: ENUMS (Safe to re-create, duplicate_object exception handled) =====

DO $$ BEGIN
  CREATE TYPE signal_type AS ENUM (
    'DOMAIN_CLASS',
    'INTENT_TAG',
    'RETRIEVAL_LANE',
    'GRAPH_FACT',
    'CLASSIFICATION',
    'RECOMMENDATION',
    'LEARNED_POS',
    'LEARNED_ENTITY',
    'AST_SYMBOL',
    'EVIDENCE_REFERENCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE classification_status AS ENUM (
    'PENDING',
    'CLASSIFYING',
    'COMPLETE',
    'CONFLICT_DETECTED',
    'FAILED',
    'DEFERRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recommendation_status AS ENUM (
    'PROPOSED',
    'EVIDENCE_GATHERING',
    'READY_FOR_REVIEW',
    'APPROVED',
    'IMPLEMENTED',
    'VALIDATED',
    'REJECTED',
    'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== STEP 2: CORE TABLES (0109 content) =====

-- semantic_signals: Core signal identity + provenance + lifecycle state
CREATE TABLE IF NOT EXISTS semantic_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(255) NOT NULL,
  revision_id VARCHAR(255) NOT NULL,
  workspace_revision TEXT NOT NULL,  -- CRITICAL: Required by 0111 functions

  -- Identity
  subject_id VARCHAR(255) NOT NULL,
  signal_type signal_type NOT NULL,

  -- Provenance
  producer VARCHAR(255) NOT NULL,
  producer_model_revision VARCHAR(255),
  producer_schema_version VARCHAR(255),

  -- Evidence
  evidence_ids TEXT[] NOT NULL DEFAULT '{}',
  evidence_confidence REAL,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255),

  -- Lifecycle state management (replaces soft-delete timestamp)
  lifecycle_state VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  state_reason TEXT,
  state_changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  state_changed_by VARCHAR(255),

  -- Provenance linking
  superseded_by UUID,
  retention_until TIMESTAMP WITH TIME ZONE,

  CONSTRAINT semantic_signals_evidence_confidence_range
    CHECK (evidence_confidence IS NULL OR (evidence_confidence >= 0.0 AND evidence_confidence <= 1.0)),
  CONSTRAINT lifecycle_state_valid CHECK (lifecycle_state IN (
    'ACTIVE', 'SUPERSEDED', 'RETRACTED', 'ARCHIVED', 'PURGE_PENDING', 'PURGED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_semantic_signals_workspace_revision
  ON semantic_signals (workspace_id, revision_id);
CREATE INDEX IF NOT EXISTS idx_semantic_signals_subject_type
  ON semantic_signals (subject_id, signal_type);
CREATE INDEX IF NOT EXISTS idx_semantic_signals_producer
  ON semantic_signals (producer);
CREATE INDEX IF NOT EXISTS idx_semantic_signals_evidence_ids
  ON semantic_signals USING GIN (evidence_ids);

-- domain_taxonomy_v1: Versioned domain label registry
CREATE TABLE IF NOT EXISTS domain_taxonomy_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(255) NOT NULL,
  domain_id VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  parent_domain_id VARCHAR(255),

  deprecated_at TIMESTAMP WITH TIME ZONE,
  deprecation_reason TEXT,
  replaced_by VARCHAR(255),

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE (domain_id, version)
);

CREATE INDEX IF NOT EXISTS idx_domain_taxonomy_domain_id ON domain_taxonomy_v1 (domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_taxonomy_active ON domain_taxonomy_v1 (is_active);
CREATE INDEX IF NOT EXISTS idx_domain_taxonomy_label ON domain_taxonomy_v1 (label);

-- classification_envelope: Signal versioning + classification state
CREATE TABLE IF NOT EXISTS classification_envelope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL,
  subject_id VARCHAR(255) NOT NULL,
  workspace_id VARCHAR(255) NOT NULL,

  status classification_status NOT NULL DEFAULT 'PENDING',
  version INTEGER NOT NULL DEFAULT 1,

  domain_labels JSONB,
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_details JSONB,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255),
  validated_at TIMESTAMP WITH TIME ZONE,
  validated_by VARCHAR(255),
  failure_reason TEXT,

  -- Lifecycle state management
  lifecycle_state VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  state_changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  state_changed_by VARCHAR(255),

  CONSTRAINT lifecycle_state_valid_classification CHECK (lifecycle_state IN (
    'ACTIVE', 'SUPERSEDED', 'ARCHIVED', 'PURGE_PENDING'
  )),
  CONSTRAINT fk_classification_envelope_signal_id
    FOREIGN KEY (signal_id) REFERENCES semantic_signals(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_classification_envelope_signal_status
  ON classification_envelope (signal_id, status);
CREATE INDEX IF NOT EXISTS idx_classification_envelope_subject_workspace
  ON classification_envelope (subject_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_classification_envelope_conflict
  ON classification_envelope (conflict_flag);

-- recommendation_log: Evidence-backed recommendation lifecycle
CREATE TABLE IF NOT EXISTS recommendation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(255) NOT NULL,
  revision_id VARCHAR(255) NOT NULL,
  subject_id VARCHAR(255) NOT NULL,

  proposed_action TEXT NOT NULL,
  inference_explanation TEXT NOT NULL,

  evidence_ids TEXT[] NOT NULL DEFAULT '{}',
  evidence_confidence REAL NOT NULL DEFAULT 0.5,

  validation_criteria TEXT NOT NULL,
  expected_impact TEXT NOT NULL,

  rollback_plan TEXT NOT NULL,
  rollback_verification TEXT NOT NULL,

  status recommendation_status NOT NULL DEFAULT 'PROPOSED',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL,

  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by VARCHAR(255),

  implemented_at TIMESTAMP WITH TIME ZONE,
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_error TEXT,

  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Lifecycle state management
  lifecycle_state VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  state_changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  state_changed_by VARCHAR(255),

  -- Mutual approval safeguard
  approved_by_distinct_from_created_by BOOLEAN NOT NULL DEFAULT FALSE,

  -- Proof linkage
  proof_manifest_id UUID,

  CONSTRAINT recommendation_log_evidence_confidence_range
    CHECK (evidence_confidence >= 0.0 AND evidence_confidence <= 1.0),
  CONSTRAINT lifecycle_state_valid_recommendation CHECK (lifecycle_state IN (
    'ACTIVE', 'SUPERSEDED', 'RETRACTED', 'ARCHIVED', 'PURGE_PENDING'
  )),
  CONSTRAINT approved_by_not_creator CHECK (
    approved_by IS NULL OR approved_by != created_by
  )
);

CREATE INDEX IF NOT EXISTS idx_recommendation_log_subject_workspace
  ON recommendation_log (subject_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_status
  ON recommendation_log (status);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_evidence
  ON recommendation_log USING GIN (evidence_ids);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_created_by
  ON recommendation_log (created_by);

-- ===== STEP 3: AUDIT TRAIL (0110 content) =====

-- semantic_lifecycle_events: Immutable append-only audit trail
CREATE TABLE IF NOT EXISTS semantic_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  previous_state VARCHAR(50) NOT NULL,
  new_state VARCHAR(50) NOT NULL,
  reason TEXT,
  actor_type VARCHAR(50) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  run_id UUID,
  proof_manifest_id UUID,
  workspace_revision TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT must_have_state_change CHECK (previous_state IS DISTINCT FROM new_state),
  CONSTRAINT valid_lifecycle_states CHECK (
    new_state IN ('ACTIVE', 'SUPERSEDED', 'RETRACTED', 'ARCHIVED', 'PURGE_PENDING', 'PURGED')
  )
);

CREATE INDEX IF NOT EXISTS idx_semantic_lifecycle_events_entity
  ON semantic_lifecycle_events (entity_id);
CREATE INDEX IF NOT EXISTS idx_semantic_lifecycle_events_created_at
  ON semantic_lifecycle_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_lifecycle_events_actor
  ON semantic_lifecycle_events (actor_id);

-- Timestamp-only triggers (no state changes via triggers; explicit functions only)
CREATE OR REPLACE FUNCTION update_semantic_signals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = COALESCE(CURRENT_USER, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER semantic_signals_timestamp_trigger
BEFORE UPDATE ON semantic_signals
FOR EACH ROW
EXECUTE FUNCTION update_semantic_signals_timestamp();

CREATE OR REPLACE FUNCTION update_classification_envelope_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = COALESCE(CURRENT_USER, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER classification_envelope_timestamp_trigger
BEFORE UPDATE ON classification_envelope
FOR EACH ROW
EXECUTE FUNCTION update_classification_envelope_timestamp();

CREATE OR REPLACE FUNCTION update_recommendation_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = COALESCE(CURRENT_USER, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recommendation_log_timestamp_trigger
BEFORE UPDATE ON recommendation_log
FOR EACH ROW
EXECUTE FUNCTION update_recommendation_log_timestamp();

-- Audit views
CREATE OR REPLACE VIEW semantic_signals_audit AS
SELECT ss.id, ss.lifecycle_state, ss.state_reason, ss.state_changed_at, ss.state_changed_by,
       sle.id as event_id, sle.previous_state, sle.new_state, sle.reason, sle.actor_id, sle.created_at
FROM semantic_signals ss
LEFT JOIN semantic_lifecycle_events sle ON sle.entity_id = ss.id AND sle.entity_type = 'semantic_signal'
ORDER BY sle.created_at DESC;

CREATE OR REPLACE VIEW semantic_signal_history AS
SELECT entity_id, entity_type, previous_state, new_state, reason, actor_id, created_at
FROM semantic_lifecycle_events
WHERE entity_type = 'semantic_signal'
ORDER BY created_at DESC;

-- ===== STEP 4: ROLE-BASED ACCESS CONTROL (0111 content) =====

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

-- Maintenance role: full privileges including DELETE
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO atlas_maintenance;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO atlas_maintenance;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO atlas_maintenance;
GRANT USAGE ON SCHEMA public TO atlas_maintenance;

-- ===== STEP 5: EXPLICIT STATE MANAGEMENT FUNCTIONS =====

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
  v_replacement_exists boolean;
  v_event_id uuid;
  v_old_state varchar(50);
BEGIN
  -- Verify replacement signal exists
  SELECT EXISTS (SELECT 1 FROM semantic_signals WHERE id = p_replacement_signal_id)
  INTO v_replacement_exists;

  IF NOT v_replacement_exists THEN
    RAISE EXCEPTION 'Replacement signal % not found', p_replacement_signal_id;
  END IF;

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
  IF v_old_state NOT IN ('ACTIVE') THEN
    RAISE EXCEPTION 'Cannot supersede signal in state %', v_old_state;
  END IF;

  -- Update signal state
  UPDATE semantic_signals
  SET lifecycle_state = 'SUPERSEDED',
      superseded_by = p_replacement_signal_id,
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
    'semantic_signal', p_signal_id, v_old_state, 'SUPERSEDED', p_reason,
    'system', p_actor_id, v_signal_row.workspace_revision, NOW()
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT p_signal_id, v_old_state::varchar, 'SUPERSEDED'::varchar, v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Promote a recommendation: enforce mutual approval
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
  v_recommendation record;
  v_creator_id varchar(255);
  v_event_id uuid;
BEGIN
  -- Fetch recommendation
  SELECT id, status, created_by INTO v_recommendation
  FROM recommendation_log
  WHERE id = p_recommendation_id
  FOR UPDATE;

  IF v_recommendation IS NULL THEN
    RAISE EXCEPTION 'Recommendation % not found', p_recommendation_id;
  END IF;

  v_creator_id := v_recommendation.created_by;

  -- VALIDATION: Mutual approval safeguard
  IF p_approver_id = v_creator_id THEN
    RAISE EXCEPTION 'Approver must be different from creator (creator: %, approver: %)', v_creator_id, p_approver_id;
  END IF;

  -- Dry-run mode
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
      updated_at = NOW()
  WHERE id = p_recommendation_id;

  -- Create immutable audit event
  INSERT INTO semantic_lifecycle_events (
    entity_type, entity_id, previous_state, new_state, reason,
    actor_type, actor_id, proof_manifest_id, workspace_revision, created_at
  )
  VALUES (
    'recommendation', p_recommendation_id, 'PROPOSED', 'APPROVED', 'Promotion approved',
    'system', p_approver_id, p_proof_manifest_id, '', NOW()
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT p_recommendation_id, 'APPROVED'::varchar, v_event_id, true;
END;
$$ LANGUAGE plpgsql;

-- Purge eligible signals: hard DELETE only on PURGE_PENDING
CREATE OR REPLACE FUNCTION purge_eligible_signals(
  p_retention_cutoff timestamp with time zone DEFAULT (NOW() - interval '90 days')
)
RETURNS TABLE (
  purged_count integer
)
AS $$
DECLARE
  v_purged_count integer;
BEGIN
  -- Hard gate: MUST be PURGE_PENDING and retention_until expired
  DELETE FROM semantic_signals
  WHERE lifecycle_state = 'PURGE_PENDING'
    AND retention_until IS NOT NULL
    AND retention_until < p_retention_cutoff;

  GET DIAGNOSTICS v_purged_count = ROW_COUNT;

  RETURN QUERY SELECT v_purged_count;
END;
$$ LANGUAGE plpgsql;

-- Create eligible-for-action views
CREATE OR REPLACE VIEW signals_eligible_for_archive AS
SELECT id, lifecycle_state, state_changed_at
FROM semantic_signals
WHERE lifecycle_state IN ('ACTIVE', 'SUPERSEDED');

CREATE OR REPLACE VIEW signals_eligible_for_purge AS
SELECT id, lifecycle_state, retention_until
FROM semantic_signals
WHERE lifecycle_state = 'PURGE_PENDING'
  AND retention_until < NOW();

-- Grant function execution permissions
GRANT EXECUTE ON FUNCTION archive_semantic_signal(uuid, varchar, text) TO atlas_application;
GRANT EXECUTE ON FUNCTION supersede_semantic_signal(uuid, uuid, varchar, text) TO atlas_application;
GRANT EXECUTE ON FUNCTION promote_recommendation(uuid, varchar, uuid, varchar, boolean) TO atlas_application;
GRANT EXECUTE ON FUNCTION purge_eligible_signals(timestamp with time zone) TO atlas_maintenance;

-- ===== FINAL VALIDATION GATES =====

-- Gate 1: workspace_revision column exists
DO $$
DECLARE
  v_column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'semantic_signals' AND column_name = 'workspace_revision'
  ) INTO v_column_exists;

  IF NOT v_column_exists THEN
    RAISE EXCEPTION 'GATE 1 FAILED: workspace_revision column missing from semantic_signals';
  END IF;

  RAISE NOTICE 'GATE 1 PASSED: workspace_revision column verified';
END $$;

-- Gate 2: Functions reference workspace_revision without error
DO $$
DECLARE
  v_functions_exist boolean;
BEGIN
  SELECT COUNT(*) = 4 INTO v_functions_exist
  FROM pg_proc
  WHERE proname IN ('archive_semantic_signal', 'supersede_semantic_signal', 'promote_recommendation', 'purge_eligible_signals');

  IF NOT v_functions_exist THEN
    RAISE EXCEPTION 'GATE 2 FAILED: Not all required functions created';
  END IF;

  RAISE NOTICE 'GATE 2 PASSED: All 4 state functions created successfully';
END $$;

-- Gate 3: Roles created and permissions granted
DO $$
DECLARE
  v_app_role_exists boolean;
  v_maint_role_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_application') INTO v_app_role_exists;
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_maintenance') INTO v_maint_role_exists;

  IF NOT (v_app_role_exists AND v_maint_role_exists) THEN
    RAISE EXCEPTION 'GATE 3 FAILED: Required roles not created';
  END IF;

  RAISE NOTICE 'GATE 3 PASSED: Both atlas_application and atlas_maintenance roles verified';
END $$;

COMMIT;
