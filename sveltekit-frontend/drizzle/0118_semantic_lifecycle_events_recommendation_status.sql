-- Fixes a real, independently-discovered pre-existing bug (found while
-- live-testing 0116's supersede_recommendation(), item 2 of the operator's
-- "1-3" follow-up list): semantic_lifecycle_events is a shared audit table
-- for BOTH semantic_signals (lifecycle_state vocabulary: ACTIVE/SUPERSEDED/
-- RETRACTED/ARCHIVED/PURGE_PENDING/PURGED) AND recommendation_log
-- (recommendation_status vocabulary: PROPOSED/EVIDENCE_GATHERING/
-- READY_FOR_REVIEW/APPROVED/IMPLEMENTED/VALIDATED/REJECTED/SUPERSEDED,
-- discriminated by entity_type). The valid_lifecycle_states CHECK constraint
-- on new_state only allowed the first vocabulary, so promote_recommendation()
-- (0111/0111-repair) has never been able to complete a real, non-dry-run
-- write — every attempt failed with "violates check constraint
-- valid_lifecycle_states" on new_state='APPROVED'.
--
-- Fix: widen the constraint to the union of both vocabularies. Additive
-- only — no existing row is touched, no column is renamed, no other
-- constraint changes.

ALTER TABLE semantic_lifecycle_events
  DROP CONSTRAINT IF EXISTS valid_lifecycle_states;

ALTER TABLE semantic_lifecycle_events
  ADD CONSTRAINT valid_lifecycle_states
  CHECK (
    new_state::text = ANY (ARRAY[
      -- semantic_signals.lifecycle_state vocabulary
      'ACTIVE', 'SUPERSEDED', 'RETRACTED', 'ARCHIVED', 'PURGE_PENDING', 'PURGED',
      -- recommendation_log.status (recommendation_status enum) vocabulary
      'PROPOSED', 'EVIDENCE_GATHERING', 'READY_FOR_REVIEW', 'APPROVED',
      'IMPLEMENTED', 'VALIDATED', 'REJECTED'
      -- NOTE: 'SUPERSEDED' appears in both vocabularies already — listed once above.
    ]::text[])
  );
