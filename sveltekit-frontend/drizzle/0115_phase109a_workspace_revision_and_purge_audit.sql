-- Phase 109A forward repair: workspace revision hardening and bounded purge audit
-- This file is intentionally forward-only. It does not rename earlier migrations.

-- Ensure semantic_signals can satisfy the lifecycle functions even if an older
-- schema version omitted workspace_revision.
ALTER TABLE semantic_signals
  ADD COLUMN IF NOT EXISTS workspace_revision TEXT;

-- Backfill from the authoritative per-row revision when needed.
UPDATE semantic_signals
SET workspace_revision = COALESCE(workspace_revision, revision_id)
WHERE workspace_revision IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM semantic_signals
    WHERE workspace_revision IS NULL
  ) THEN
    RAISE EXCEPTION 'semantic_signals.workspace_revision still contains NULL values after repair backfill';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE semantic_signals
      ADD CONSTRAINT semantic_signals_workspace_revision_nn
      CHECK (workspace_revision IS NOT NULL) NOT VALID;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END;
$$;

ALTER TABLE semantic_signals
  VALIDATE CONSTRAINT semantic_signals_workspace_revision_nn;

-- Immutable purge audit ledger.
CREATE TABLE IF NOT EXISTS semantic_signal_purge_ledger (
  purge_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL UNIQUE,
  entity_type TEXT NOT NULL DEFAULT 'semantic_signal',
  final_state TEXT NOT NULL DEFAULT 'PURGED',
  record_fingerprint TEXT NOT NULL,
  evidence_fingerprint TEXT,
  actor_type VARCHAR(50) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  retention_cutoff TIMESTAMP WITH TIME ZONE NOT NULL,
  proof_manifest_id UUID,
  run_id UUID,
  workspace_revision TEXT NOT NULL,
  purged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT semantic_signal_purge_ledger_final_state_check CHECK (final_state = 'PURGED'),
  CONSTRAINT semantic_signal_purge_ledger_entity_type_check CHECK (entity_type = 'semantic_signal')
);

-- Keep the lifecycle functions explicit about workspace revision provenance.
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
  SELECT id, lifecycle_state, workspace_revision INTO v_signal_row
  FROM semantic_signals
  WHERE id = p_signal_id
  FOR UPDATE;

  IF v_signal_row IS NULL THEN
    RAISE EXCEPTION 'Signal % not found', p_signal_id;
  END IF;

  IF v_signal_row.workspace_revision IS NULL THEN
    RAISE EXCEPTION 'Signal % is missing workspace_revision', p_signal_id;
  END IF;

  v_old_state := v_signal_row.lifecycle_state;

  IF v_old_state NOT IN ('ACTIVE', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'Cannot archive signal in state %', v_old_state;
  END IF;

  UPDATE semantic_signals
  SET lifecycle_state = 'ARCHIVED',
      state_reason = p_reason,
      state_changed_at = NOW(),
      state_changed_by = p_actor_id,
      updated_at = NOW()
  WHERE id = p_signal_id;

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
  SELECT id, lifecycle_state, workspace_revision INTO v_signal_row
  FROM semantic_signals
  WHERE id = p_signal_id
  FOR UPDATE;

  IF v_signal_row IS NULL THEN
    RAISE EXCEPTION 'Signal % not found', p_signal_id;
  END IF;

  IF v_signal_row.workspace_revision IS NULL THEN
    RAISE EXCEPTION 'Signal % is missing workspace_revision', p_signal_id;
  END IF;

  SELECT id, workspace_revision INTO v_replacement_row
  FROM semantic_signals
  WHERE id = p_replacement_signal_id;

  IF v_replacement_row IS NULL THEN
    RAISE EXCEPTION 'Replacement signal % not found', p_replacement_signal_id;
  END IF;

  IF v_replacement_row.workspace_revision IS NULL THEN
    RAISE EXCEPTION 'Replacement signal % is missing workspace_revision', p_replacement_signal_id;
  END IF;

  v_old_state := v_signal_row.lifecycle_state;

  IF v_old_state NOT IN ('ACTIVE') THEN
    RAISE EXCEPTION 'Can only supersede ACTIVE signals, current state: %', v_old_state;
  END IF;

  UPDATE semantic_signals
  SET lifecycle_state = 'SUPERSEDED',
      state_reason = p_reason,
      state_changed_at = NOW(),
      state_changed_by = p_actor_id,
      superseded_by = p_replacement_signal_id,
      updated_at = NOW()
  WHERE id = p_signal_id;

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

CREATE OR REPLACE FUNCTION purge_eligible_signals(
  p_retention_cutoff timestamp with time zone DEFAULT (NOW() - INTERVAL '90 days'),
  p_batch_size integer DEFAULT 250,
  p_actor_id varchar(255) DEFAULT current_user,
  p_reason text DEFAULT 'retention cutoff purge'
)
RETURNS TABLE (
  signal_id uuid,
  purge_timestamp timestamp with time zone
)
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT
      id,
      subject_id,
      signal_type,
      producer,
      evidence_ids,
      state_reason,
      workspace_revision
    FROM semantic_signals
    WHERE lifecycle_state = 'PURGE_PENDING'
      AND (
        (retention_until IS NOT NULL AND retention_until < p_retention_cutoff)
        OR (retention_until IS NULL AND created_at < p_retention_cutoff)
      )
    ORDER BY created_at ASC, id ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ), ledger AS (
    INSERT INTO semantic_signal_purge_ledger (
      signal_id,
      entity_type,
      final_state,
      record_fingerprint,
      evidence_fingerprint,
      actor_type,
      actor_id,
      reason,
      retention_cutoff,
      proof_manifest_id,
      run_id,
      workspace_revision,
      purged_at
    )
    SELECT
      e.id,
      'semantic_signal',
      'PURGED',
      md5(concat_ws('|', e.id::text, e.subject_id, e.signal_type::text, e.producer, array_to_string(e.evidence_ids, ','), coalesce(e.state_reason, ''), e.workspace_revision)),
      md5(coalesce(array_to_string(e.evidence_ids, ','), '')),
      'system',
      p_actor_id,
      p_reason,
      p_retention_cutoff,
      NULL,
      NULL,
      e.workspace_revision,
      NOW()
    FROM eligible e
    RETURNING signal_id
  ), deleted AS (
    DELETE FROM semantic_signals s
    USING eligible e
    WHERE s.id = e.id
    RETURNING s.id
  )
  SELECT d.id, NOW()
  FROM deleted d
  ORDER BY d.id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION archive_semantic_signal(uuid, varchar, text) TO atlas_application;
GRANT EXECUTE ON FUNCTION supersede_semantic_signal(uuid, uuid, varchar, text) TO atlas_application;
GRANT EXECUTE ON FUNCTION purge_eligible_signals(timestamp with time zone, integer, varchar, text) TO atlas_maintenance;
