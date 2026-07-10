-- 0112_proposed_tool_calls.sql
-- Proposed tool invocations with schema validation results.
-- One row per tool proposal (before execution). Maps to RouteTrace.proposalId.
-- Records: proposal → execution → result (three-table telemetry for auditable routing).

CREATE TABLE IF NOT EXISTS proposed_tool_calls (
  proposal_id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id              uuid        REFERENCES agent_traces(trace_id) ON DELETE SET NULL,
  decision_id           uuid,                          -- links to routing decision (not FK yet)
  tool_name             text        NOT NULL,          -- MCP tool name (e.g., "kb.trace_search")
  tool_namespace        text,                          -- tool domain (e.g., "kb", "topology", "graph")
  arguments             jsonb       NOT NULL DEFAULT '{}',  -- validated arguments per schema

  -- Schema validation results
  schema_valid          boolean     NOT NULL DEFAULT false,
  validation_errors     text[],                        -- array of Zod error messages
  validation_warnings   text[],

  -- Call properties
  read_only             boolean     NOT NULL DEFAULT true,
  side_effect_class     text,                          -- 'none' | 'minor' | 'major' | 'data_loss'
  approval_required     boolean     NOT NULL DEFAULT false,  -- needs human review before exec

  -- Execution status
  executed              boolean     NOT NULL DEFAULT false,
  execution_id          uuid,                          -- links to actual execution result
  executed_at           timestamptz,

  -- Audit trail
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text,                          -- user/agent ID

  -- OpenTelemetry correlation
  otel_span_id          text,
  otel_trace_id         text
);

CREATE INDEX IF NOT EXISTS idx_ptc_trace_id          ON proposed_tool_calls (trace_id);
CREATE INDEX IF NOT EXISTS idx_ptc_decision_id       ON proposed_tool_calls (decision_id);
CREATE INDEX IF NOT EXISTS idx_ptc_tool_name         ON proposed_tool_calls (tool_name);
CREATE INDEX IF NOT EXISTS idx_ptc_executed          ON proposed_tool_calls (executed);
CREATE INDEX IF NOT EXISTS idx_ptc_created_at        ON proposed_tool_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ptc_approval_required ON proposed_tool_calls (approval_required) WHERE approval_required = true;
CREATE INDEX IF NOT EXISTS idx_ptc_schema_valid      ON proposed_tool_calls (schema_valid);

-- Comments for clarity
COMMENT ON TABLE proposed_tool_calls IS 'Proposed tool invocations with schema validation. Bridge between RouterDecision and ToolResult.';
COMMENT ON COLUMN proposed_tool_calls.schema_valid IS 'true if arguments pass Zod schema validation';
COMMENT ON COLUMN proposed_tool_calls.approval_required IS 'true if tool is non-readOnly or has high side-effect class';
COMMENT ON COLUMN proposed_tool_calls.side_effect_class IS 'Severity of potential side effects: none | minor (cache invalidation) | major (data modification) | data_loss (destructive)';
