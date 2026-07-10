-- Phase 2A.2: Agent Telemetry Tables
-- Persist tool routing decisions, execution events, and outcomes

CREATE TABLE IF NOT EXISTS proposed_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL,
  decision_id varchar(255) UNIQUE NOT NULL,
  query text NOT NULL,
  previous_state varchar(50) NOT NULL,
  selected_tool_name varchar(255) NOT NULL,
  selected_tool_namespace varchar(50),
  candidate_tools text[] NOT NULL, -- array of tool names
  confidence_score real NOT NULL, -- [0,1]
  top_k int DEFAULT 3,

  -- Scoring breakdown (all [0,1])
  semantic_score real DEFAULT 0.5,
  intent_score real DEFAULT 0.5,
  schema_fitness_score real DEFAULT 0.5,
  transition_score real DEFAULT 0.5,
  health_score real DEFAULT 0.5,
  historical_success_score real DEFAULT 0.5,
  provenance_score real DEFAULT 0.5,
  latency_score real DEFAULT 0.5,
  topology_score real DEFAULT 0.5,

  -- Constraints and context
  read_only_constraint boolean DEFAULT false,
  required_services text[] DEFAULT '{}',

  -- Proposal metadata
  proposal_json jsonb, -- full proposal payload
  approval_required boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposed_tool_calls_trace_id
  ON proposed_tool_calls(trace_id);
CREATE INDEX IF NOT EXISTS idx_proposed_tool_calls_decision_id
  ON proposed_tool_calls(decision_id);
CREATE INDEX IF NOT EXISTS idx_proposed_tool_calls_created_at
  ON proposed_tool_calls(created_at DESC);

-- Tool execution events
CREATE TABLE IF NOT EXISTS tool_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  proposal_id uuid REFERENCES proposed_tool_calls(id),

  tool_name varchar(255) NOT NULL,
  tool_namespace varchar(50),
  arguments jsonb NOT NULL,

  -- Execution status
  status varchar(50) NOT NULL, -- 'pending', 'executing', 'completed', 'failed', 'timeout'
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone,
  duration_ms int,

  -- Result classification (8 classes)
  result_class varchar(50), -- 'answer', 'candidates', 'partial', 'empty', 'validation_error', 'transport_error', 'tool_error', 'timeout'
  result_count int DEFAULT 0,
  source_ref_count int DEFAULT 0,
  source_refs text[],

  -- Error tracking
  error_message text,
  error_code varchar(50),

  -- Metadata
  from_server boolean DEFAULT false,
  cache_hit boolean DEFAULT false,
  event_json jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_call_events_trace_id
  ON tool_call_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_events_execution_id
  ON tool_call_events(execution_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_events_status
  ON tool_call_events(status);
CREATE INDEX IF NOT EXISTS idx_tool_call_events_created_at
  ON tool_call_events(created_at DESC);

-- Outcome ledger (state transitions + decisions)
CREATE TABLE IF NOT EXISTS outcome_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL,

  -- State machine info
  previous_state varchar(50) NOT NULL,
  next_state varchar(50) NOT NULL,
  state_transition_reason text,

  -- Tool execution outcome
  tool_name varchar(255),
  execution_id uuid,
  result_class varchar(50),

  -- Recovery info (if applicable)
  recovery_attempted boolean DEFAULT false,
  recovery_tool_name varchar(255),
  recovery_state varchar(50),
  recovery_reason text,

  -- Final outcome
  final_state varchar(50),
  final_outcome varchar(50), -- 'success', 'failed', 'escalated', 'recovered'

  -- Telemetry
  total_duration_ms int,
  tool_duration_ms int,
  recovery_duration_ms int,

  -- Metadata
  entry_json jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_ledger_trace_id
  ON outcome_ledger(trace_id);
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_previous_state
  ON outcome_ledger(previous_state);
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_next_state
  ON outcome_ledger(next_state);
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_final_outcome
  ON outcome_ledger(final_outcome);
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_created_at
  ON outcome_ledger(created_at DESC);
