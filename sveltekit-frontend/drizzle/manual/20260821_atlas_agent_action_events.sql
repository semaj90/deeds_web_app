-- Parent Atlas temporal action ledger persistence
--
-- WorkflowActionEventV1 remains the canonical workflow/action identity owner.
-- This table is append-only observed execution history for AgentActionEventV1.
-- ActionCurrentProjectionV1 is derived/rebuildable and is intentionally not
-- stored as canonical truth in this first durable tranche.

CREATE TABLE IF NOT EXISTS atlas_agent_action_events (
  event_id             text        PRIMARY KEY,
  ledger_sequence      bigint      NOT NULL UNIQUE CHECK (ledger_sequence > 0),
  workflow_id          text        NOT NULL,
  workflow_revision    integer     NOT NULL CHECK (workflow_revision >= 0),
  action_id            text        NOT NULL,
  execution_key        text        NOT NULL CHECK (execution_key ~ '^[a-f0-9]{64}$'),
  opcode               text        NOT NULL,
  target_canonical_id  text,
  state                text        NOT NULL,
  outcome              text,
  error_code           text,
  workspace_revision   text,
  source_revision      text,
  graph_revision       text,
  observed_at          timestamptz NOT NULL,
  event_checksum       text        NOT NULL CHECK (event_checksum ~ '^[a-f0-9]{64}$'),
  event_json           jsonb       NOT NULL,
  producer_revision    text        NOT NULL,
  persisted_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_agent_action_events_execution
  ON atlas_agent_action_events (execution_key, ledger_sequence DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_agent_action_events_target
  ON atlas_agent_action_events (target_canonical_id, ledger_sequence DESC)
  WHERE target_canonical_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_agent_action_events_opcode
  ON atlas_agent_action_events (opcode, ledger_sequence DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_agent_action_events_outcome
  ON atlas_agent_action_events (outcome, ledger_sequence DESC)
  WHERE outcome IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_agent_action_events_error
  ON atlas_agent_action_events (error_code, ledger_sequence DESC)
  WHERE error_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_agent_action_events_revisions
  ON atlas_agent_action_events (
    workspace_revision,
    source_revision,
    graph_revision,
    ledger_sequence DESC
  );

CREATE INDEX IF NOT EXISTS idx_atlas_agent_action_events_workflow
  ON atlas_agent_action_events (workflow_id, workflow_revision, action_id, ledger_sequence);