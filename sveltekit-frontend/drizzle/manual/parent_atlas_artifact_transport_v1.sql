-- Parent Atlas artifact transport v1
--
-- Durable support for reference-only queue payloads, ActionKey single-flight
-- fencing, immutable successful receipts, and artifact lifecycle projection.
-- Apply explicitly through the repository's manual migration process.

CREATE TABLE IF NOT EXISTS workflow_artifacts (
  artifact_id        text        PRIMARY KEY,
  artifact_hash      text        NOT NULL UNIQUE,
  schema_id          text        NOT NULL,
  checksum           text        NOT NULL,
  revision_set_hash  text        NOT NULL,
  revisions          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  payload             jsonb       NOT NULL,
  payload_byte_length integer     NOT NULL CHECK (payload_byte_length >= 0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_revision_set
  ON workflow_artifacts (revision_set_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_action_leases (
  action_key       text        PRIMARY KEY,
  lease_owner      text        NOT NULL,
  fencing_token    bigint      NOT NULL CHECK (fencing_token > 0),
  lease_expires_at timestamptz NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_action_leases_expiry
  ON workflow_action_leases (lease_expires_at);

-- Successful output is immutable per ActionKey. Duplicate at-least-once
-- deliveries read this receipt instead of recomputing the artifact.
CREATE TABLE IF NOT EXISTS workflow_action_receipts (
  action_key              text        PRIMARY KEY,
  fencing_token           bigint      NOT NULL CHECK (fencing_token > 0),
  output_artifact_address jsonb       NOT NULL,
  producer_revision       text        NOT NULL,
  completed_at            timestamptz NOT NULL DEFAULT now()
);

-- Event-fabric projection sink. The event_id primary key makes replay safe.
CREATE TABLE IF NOT EXISTS workflow_artifact_events (
  event_id       uuid        PRIMARY KEY,
  event_type     text        NOT NULL CHECK (event_type IN ('artifact.materialized', 'artifact.failed')),
  action_key     text        NOT NULL,
  artifact_id    text,
  payload        jsonb       NOT NULL,
  occurred_at    timestamptz NOT NULL,
  projected_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_artifact_events_action
  ON workflow_artifact_events (action_key, occurred_at DESC);
