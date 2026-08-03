-- Phase 109A: revision-aware recommendation supersession
--
-- Bounded seam selected by the Parent Atlas Workstation Implementation Truth
-- Audit (2026-08-02), capability group B ("Recommendation lifecycle and
-- supersession"). Finding: recommendation_log.lifecycle_state already allows
-- the 'SUPERSEDED' value (see lifecycle_state_valid_recommendation check
-- constraint), and recommendation_log already carries workspace_id/revision_id
-- identity columns (NOT NULL since the table's original migration), but no
-- superseded_by column and no supersede_recommendation() function exist to
-- perform that transition. promote_recommendation() (0111/0111-repair) is the
-- only recommendation-level lifecycle function. This migration adds the
-- missing function, mirroring supersede_semantic_signal()'s proven shape
-- (0115), with one addition specific to recommendations: the replacement
-- must share the same subject_id + workspace_id but carry a DIFFERENT
-- revision_id, so a recommendation cannot be "superseded" by a same-revision
-- duplicate — closing the "revision aware" gap the audit named.
--
-- This file is additive only: new nullable column, new function, new grant.
-- No existing column, function, or row is altered.

ALTER TABLE recommendation_log
  ADD COLUMN IF NOT EXISTS superseded_by UUID;

CREATE OR REPLACE FUNCTION supersede_recommendation(
  p_recommendation_id uuid,
  p_replacement_recommendation_id uuid,
  p_actor_id varchar(255),
  p_reason text
)
RETURNS TABLE (
  recommendation_id uuid,
  previous_state varchar(50),
  new_state varchar(50),
  event_id uuid
)
AS $$
DECLARE
  v_rec_row record;
  v_replacement_row record;
  v_event_id uuid;
  v_old_state varchar(50);
BEGIN
  IF p_recommendation_id = p_replacement_recommendation_id THEN
    RAISE EXCEPTION 'Recommendation % cannot supersede itself', p_recommendation_id;
  END IF;

  SELECT id, lifecycle_state, workspace_id, revision_id, subject_id
  INTO v_rec_row
  FROM recommendation_log
  WHERE id = p_recommendation_id
  FOR UPDATE;

  IF v_rec_row IS NULL THEN
    RAISE EXCEPTION 'Recommendation % not found', p_recommendation_id;
  END IF;

  SELECT id, workspace_id, revision_id, subject_id
  INTO v_replacement_row
  FROM recommendation_log
  WHERE id = p_replacement_recommendation_id;

  IF v_replacement_row IS NULL THEN
    RAISE EXCEPTION 'Replacement recommendation % not found', p_replacement_recommendation_id;
  END IF;

  -- Revision-aware guard: a replacement must address the same subject in the
  -- same workspace, but must carry a distinct revision_id. This is the
  -- concrete gap the audit found: nothing previously stopped a same-revision
  -- "supersession" (a no-op disguised as a state transition).
  IF v_replacement_row.subject_id IS DISTINCT FROM v_rec_row.subject_id THEN
    RAISE EXCEPTION 'Replacement recommendation % targets a different subject (% vs %)',
      p_replacement_recommendation_id, v_replacement_row.subject_id, v_rec_row.subject_id;
  END IF;

  IF v_replacement_row.workspace_id IS DISTINCT FROM v_rec_row.workspace_id THEN
    RAISE EXCEPTION 'Replacement recommendation % is in a different workspace (% vs %)',
      p_replacement_recommendation_id, v_replacement_row.workspace_id, v_rec_row.workspace_id;
  END IF;

  IF v_replacement_row.revision_id = v_rec_row.revision_id THEN
    RAISE EXCEPTION 'Replacement recommendation % has the same revision_id (%) as the recommendation being superseded — supersession requires a distinct revision',
      p_replacement_recommendation_id, v_rec_row.revision_id;
  END IF;

  v_old_state := v_rec_row.lifecycle_state;

  IF v_old_state NOT IN ('ACTIVE') THEN
    RAISE EXCEPTION 'Can only supersede ACTIVE recommendations, current state: %', v_old_state;
  END IF;

  UPDATE recommendation_log
  SET lifecycle_state = 'SUPERSEDED',
      superseded_by = p_replacement_recommendation_id,
      state_changed_at = NOW(),
      state_changed_by = p_actor_id,
      updated_at = NOW()
  WHERE id = p_recommendation_id;

  INSERT INTO semantic_lifecycle_events (
    entity_type, entity_id, previous_state, new_state, reason,
    actor_type, actor_id, workspace_revision, created_at
  )
  VALUES (
    'recommendation', p_recommendation_id, v_old_state, 'SUPERSEDED', p_reason,
    'system', p_actor_id, v_rec_row.revision_id, NOW()
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT p_recommendation_id, v_old_state::varchar, 'SUPERSEDED'::varchar, v_event_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION supersede_recommendation(uuid, uuid, varchar, text) TO atlas_application;
