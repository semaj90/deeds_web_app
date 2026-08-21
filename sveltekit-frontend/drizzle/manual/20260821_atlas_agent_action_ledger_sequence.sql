-- Parent Atlas temporal action append-order allocator
--
-- Follow-up to the already-applied atlas_agent_action_events migration.
-- This sequence orders immutable ledger appends only. It is not workflow,
-- action, execution, revision, artifact, or canonical identity.

CREATE SEQUENCE IF NOT EXISTS atlas_agent_action_ledger_sequence_seq;

-- Advance strictly beyond both persisted history and any value previously
-- reserved by nextval(). Gaps are legal if a process crashes after reservation.
SELECT setval(
  'atlas_agent_action_ledger_sequence_seq',
  GREATEST(
    COALESCE((SELECT MAX(ledger_sequence) FROM atlas_agent_action_events), 0),
    (SELECT last_value FROM atlas_agent_action_ledger_sequence_seq)
  ),
  true
);
