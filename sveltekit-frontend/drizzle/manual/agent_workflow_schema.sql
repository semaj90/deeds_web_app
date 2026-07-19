-- Agent workflow canonical schema
-- Separate from legacy agent_actions (UI action log).
-- Follows the transactional outbox pattern:
--   Postgres decides what happened.
--   outbox_events feeds Redis/Qdrant/mmap workers.
--   workflow_events is append-only audit history.

CREATE TABLE IF NOT EXISTS agent_runs (
    run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_name   text NOT NULL,
    workflow_version text NOT NULL,
    status          text NOT NULL DEFAULT 'PROPOSED'
                    CHECK (status IN (
                        'PROPOSED','VALIDATED','AUTHORIZED','READY',
                        'RUNNING','SUCCEEDED','FAILED','DENIED','WAITING_APPROVAL'
                    )),
    tenant_id       uuid NOT NULL,
    initiated_by    text NOT NULL,
    state           jsonb NOT NULL DEFAULT '{}',
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status
    ON agent_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant
    ON agent_runs (tenant_id, started_at DESC);

-- Canonical per-action record with idempotency.
-- Distinct from public.agent_actions (legacy UI log, no run_id/idempotency).
CREATE TABLE IF NOT EXISTS agent_run_actions (
    action_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          uuid NOT NULL REFERENCES agent_runs(run_id),
    sequence_no     bigint NOT NULL,
    action_type     text NOT NULL,
    input_packet    jsonb NOT NULL,
    input_hash      text NOT NULL,
    permission_scope text[] NOT NULL DEFAULT '{}',
    risk_level      smallint NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'PROPOSED'
                    CHECK (status IN (
                        'PROPOSED','VALIDATED','AUTHORIZED','READY',
                        'RUNNING','SUCCEEDED','RETRY_PENDING',
                        'DENIED','WAITING_APPROVAL','FAILED'
                    )),
    idempotency_key text NOT NULL,
    causation_id    uuid,
    started_at      timestamptz,
    finished_at     timestamptz,
    UNIQUE (run_id, sequence_no),
    UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_actions_run
    ON agent_run_actions (run_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_agent_run_actions_status
    ON agent_run_actions (status, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_action_results (
    result_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id       uuid NOT NULL REFERENCES agent_run_actions(action_id),
    output_packet   jsonb,
    output_hash     text,
    exit_code       integer,
    error_code      text,
    error_detail    jsonb,
    duration_ms     integer NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Append-only. Never UPDATE or DELETE rows; corrections are new events.
CREATE TABLE IF NOT EXISTS workflow_events (
    event_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          uuid NOT NULL REFERENCES agent_runs(run_id),
    action_id       uuid,
    event_type      text NOT NULL,
    sequence_no     bigint NOT NULL,
    payload         jsonb NOT NULL,
    occurred_at     timestamptz NOT NULL,
    recorded_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_run
    ON workflow_events (run_id, sequence_no);

-- Transactional outbox for async fanout to Redis/Qdrant/mmap workers.
-- Separate from vector_outbox (embedding-specific) and promotion_outbox (packet promotion).
CREATE TABLE IF NOT EXISTS outbox_events (
    outbox_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type  text NOT NULL,
    aggregate_id    uuid NOT NULL,
    event_type      text NOT NULL,
    payload         jsonb NOT NULL,
    published_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished
    ON outbox_events (created_at)
    WHERE published_at IS NULL;

-- Token artifact manifest: Postgres stores WHERE, mmap stores WHAT.
-- Do not store token_ids integer[] inline; store snapshot_uri + offsets.
CREATE TABLE IF NOT EXISTS token_artifacts (
    artifact_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ref          text NOT NULL,
    tokenizer_id        text NOT NULL,
    tokenizer_hash      text NOT NULL,
    content_hash        text NOT NULL,
    token_count         integer NOT NULL,
    snapshot_uri        text NOT NULL,
    token_offset_start  bigint NOT NULL,
    token_offset_end    bigint NOT NULL,
    metadata            jsonb NOT NULL DEFAULT '{}',
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (content_hash, tokenizer_hash)
);

CREATE INDEX IF NOT EXISTS idx_token_artifacts_source
    ON token_artifacts (source_ref);
