-- 0111_tool_call_runtime_contract.sql
-- One row per tool invocation. Lives permanently; never overwritten.
-- Fills the gap between agent_traces.tool_calls (JSONB blob) and observable per-call records.

CREATE TABLE IF NOT EXISTS tool_call_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id        uuid        REFERENCES agent_traces(trace_id) ON DELETE SET NULL,
  session_id      text,                            -- OpenCode / browser session
  tool_name       text        NOT NULL,            -- MCP tool name e.g. "db_table_inspect"
  tool_source     text        NOT NULL DEFAULT 'mcp',  -- 'mcp' | 'grpc' | 'opencode' | 'internal'
  arguments       jsonb       NOT NULL DEFAULT '{}',
  result_summary  text,                            -- first 512 chars of result
  result_ok       boolean,                         -- null = pending
  error_message   text,
  latency_ms      integer,
  otel_span_id    text,                            -- OpenTelemetry span ID for correlation
  otel_trace_id   text,
  called_at       timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tce_tool_name   ON tool_call_events (tool_name);
CREATE INDEX IF NOT EXISTS idx_tce_called_at   ON tool_call_events (called_at DESC);
CREATE INDEX IF NOT EXISTS idx_tce_trace_id    ON tool_call_events (trace_id);
CREATE INDEX IF NOT EXISTS idx_tce_session     ON tool_call_events (session_id);

-- Task/issue envelopes — durable record of what the agent was asked to do.
-- One row per logical unit of work. Tool calls reference tasks via session_id or task_id.

CREATE TABLE IF NOT EXISTS agent_tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type       text        NOT NULL,            -- 'tool_call' | 'retrieval' | 'summarize' | 'fix' | 'audit'
  title           text,
  description     text,
  status          text        NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  priority        integer     NOT NULL DEFAULT 50,  -- 0-100, lower = higher priority
  source_ref      text,                            -- which file/packet triggered this
  packet_key      text,
  session_id      text,
  payload         jsonb       NOT NULL DEFAULT '{}',   -- task-type-specific params
  result          jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_at_status       ON agent_tasks (status);
CREATE INDEX IF NOT EXISTS idx_at_created_at   ON agent_tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_at_source_ref   ON agent_tasks (source_ref);
CREATE INDEX IF NOT EXISTS idx_at_session      ON agent_tasks (session_id);

-- Outcome / reward ledger — append-only.
-- Records what happened after a task completed: was it correct, what score, what reward signal.

CREATE TABLE IF NOT EXISTS outcome_ledger (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid        REFERENCES agent_tasks(id) ON DELETE SET NULL,
  trace_id        uuid        REFERENCES agent_traces(trace_id) ON DELETE SET NULL,
  tool_call_id    uuid        REFERENCES tool_call_events(id) ON DELETE SET NULL,
  outcome_type    text        NOT NULL,            -- 'retrieval_quality' | 'tool_success' | 'user_rating' | 'auto_eval'
  score           real,                            -- 0.0–1.0
  reward          real,                            -- signed reward for RL
  feedback        text,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ol_task_id      ON outcome_ledger (task_id);
CREATE INDEX IF NOT EXISTS idx_ol_outcome_type ON outcome_ledger (outcome_type);
CREATE INDEX IF NOT EXISTS idx_ol_recorded_at  ON outcome_ledger (recorded_at DESC);