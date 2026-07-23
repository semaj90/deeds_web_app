-- Workflow orchestration tables for the tRPC + outbox pattern.
--
-- These are distinct from the existing agent_runs table (which uses tenant_id
-- and workflow_name for Mastra-style runs). These tables implement the
-- LangGraph-compatible stateful run model with Postgres-first task ordering.
--
-- Postgres is canonical truth. RabbitMQ receives task messages only AFTER
-- both workflow_runs and workflow_outbox rows are committed in the same tx.
--
-- Status registry: derived from run-status.ts — keep both in sync.
--   terminal states: completed, failed, cancelled
--   'cancelled' is user-initiated; 'failed' is non-recoverable error.
--   Never use 'failed' for cancellation.

-- ---------------------------------------------------------------------------
-- workflow_runs — one row per user-initiated query-to-worker run
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflow_runs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          integer     NOT NULL,
  status           text        NOT NULL DEFAULT 'received'
                               CHECK (status IN (
                                 'received','planning','executing',
                                 'validating','blocked',
                                 'completed','failed','cancelled'
                               )),
  trace_id         text        NOT NULL,
  query            text        NOT NULL,
  graph_id         text        NOT NULL,
  last_error_code  text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Compound index supports keyset pagination: ORDER BY started_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_started
  ON workflow_runs (user_id, started_at DESC, id DESC);

-- Active-only index for status queries
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
  ON workflow_runs (status, updated_at DESC)
  WHERE status NOT IN ('completed', 'failed', 'cancelled');

-- ---------------------------------------------------------------------------
-- workflow_tasks — one row per RabbitMQ task dispatched for a run
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflow_tasks (
  id                  uuid        PRIMARY KEY,
  run_id              uuid        NOT NULL REFERENCES workflow_runs(id),
  request_id          uuid        NOT NULL,
  trace_id            text,
  command_type        text        NOT NULL,
  capability          text        NOT NULL,
  target_worker_class text        NOT NULL,
  status              text        NOT NULL DEFAULT 'queued'
                                  CHECK (status IN (
                                    'queued','claimed','running',
                                    'succeeded','failed','timed_out'
                                  )),
  attempt             integer     NOT NULL DEFAULT 0,
  idempotency_key     text        NOT NULL UNIQUE,
  payload             jsonb       NOT NULL,
  timeout_ms          integer     NOT NULL,
  result              jsonb,
  error_message       text,
  claimed_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_run_id
  ON workflow_tasks (run_id);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status
  ON workflow_tasks (status, created_at)
  WHERE status IN ('queued', 'claimed', 'running');

-- ---------------------------------------------------------------------------
-- workflow_outbox — transactional outbox for RabbitMQ delivery
--
-- task_id is NULLABLE (issue 10):
--   Run-level events (workflow.run.started, workflow.run.resumed, etc.)
--   set task_id = NULL because no workflow_task row exists yet.
--   Task-level events (worker.task.queued, worker.task.completed, etc.)
--   set task_id to the actual workflow_tasks.id.
--
-- Written atomically with the triggering mutation in the same DB transaction.
-- A background publisher (startOutboxPublisher) polls this table and
-- delivers to RabbitMQ, then marks delivered_at. Failed deliveries
-- increment attempt and eventually set failed_at after 5 attempts.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflow_outbox (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid        NOT NULL,
  task_id       uuid,                   -- NULL for run-level events
  event_type    text        NOT NULL,
  payload       jsonb       NOT NULL,
  routing_key   text        NOT NULL,
  exchange      text        NOT NULL,
  attempt       integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz,
  failed_at     timestamptz,
  error_message text
);

-- Publisher selects in created_at order, skipping locked rows
CREATE INDEX IF NOT EXISTS idx_workflow_outbox_undelivered
  ON workflow_outbox (created_at ASC)
  WHERE delivered_at IS NULL AND failed_at IS NULL;

-- ---------------------------------------------------------------------------
-- workflow_approvals — human-in-the-loop approval decisions
--
-- UNIQUE(run_id, approval_id) enforces idempotency (issue 5):
--   The service layer uses ON CONFLICT (run_id, approval_id) DO NOTHING
--   so duplicate POSTs from retries or double-clicks are safe.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflow_approvals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid        NOT NULL REFERENCES workflow_runs(id),
  approval_id  uuid        NOT NULL,
  decision     text        NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note         text,
  decided_by   integer     NOT NULL,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, approval_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_approvals_run_id
  ON workflow_approvals (run_id);
