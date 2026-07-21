-- ============================================================================
-- Durable Execution Journal Schema
-- ============================================================================
-- Records every step of a workflow execution to enable crash recovery and
-- idempotent re-execution without duplicating LLM calls or DB mutations.
--
-- Three key tables:
--   1. execution_runs — one record per workflow invocation
--   2. execution_journal_steps — atomic operations (read, LLM, write, validate)
--   3. execution_side_effects — immutable log of every mutation
--   4. execution_dependencies — step ordering and data flow
-- ============================================================================

-- execution_runs: Represents one workflow invocation
CREATE TABLE IF NOT EXISTS execution_runs (
  id BIGSERIAL PRIMARY KEY,

  -- Unique identification
  run_id TEXT UNIQUE NOT NULL,
  task_id TEXT NOT NULL,
  agent TEXT NOT NULL,

  -- Execution state
  status TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | COMPLETED | FAILED | SUSPENDED | RESUMED
  input JSONB NOT NULL,
  output JSONB,
  error_message TEXT,

  -- Crash recovery
  checkpoint_step_id BIGINT,
  recovery_count INT DEFAULT 0,

  -- Temporal metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  resumed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_execution_runs_run_id ON execution_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_execution_runs_task_id ON execution_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_execution_runs_agent ON execution_runs(agent);
CREATE INDEX IF NOT EXISTS idx_execution_runs_status ON execution_runs(status);


-- execution_journal_steps: Records each atomic operation
CREATE TABLE IF NOT EXISTS execution_journal_steps (
  id BIGSERIAL PRIMARY KEY,

  -- Ownership
  run_id TEXT NOT NULL REFERENCES execution_runs(run_id),
  step_index INT NOT NULL,

  -- Step definition
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL,  -- 'tool_call' | 'llm_completion' | 'db_mutation' | 'validation'
  idempotency_key TEXT UNIQUE NOT NULL,

  -- Execution
  status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | EXECUTING | SUCCESS | FAILED | SKIPPED

  -- Input & output
  input JSONB NOT NULL,
  output JSONB,
  error TEXT,

  -- Proof of execution
  execution_duration_ms INT,
  tokens_used INT,
  cache_hit BOOLEAN DEFAULT FALSE,

  -- Recovery info
  execution_attempt INT DEFAULT 1,
  executed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_steps_run_id ON execution_journal_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_steps_idempotency_key ON execution_journal_steps(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_steps_status ON execution_journal_steps(status);
CREATE INDEX IF NOT EXISTS idx_steps_step_type ON execution_journal_steps(step_type);


-- execution_side_effects: Immutable log of mutations
CREATE TABLE IF NOT EXISTS execution_side_effects (
  id BIGSERIAL PRIMARY KEY,

  -- Ownership
  run_id TEXT NOT NULL REFERENCES execution_runs(run_id),
  step_id BIGINT NOT NULL REFERENCES execution_journal_steps(id),

  -- Effect type
  effect_type TEXT NOT NULL,  -- 'db_write' | 'file_write' | 'api_call' | 'cache_invalidate'
  resource_id TEXT NOT NULL,

  -- Immutable record
  operation TEXT NOT NULL,  -- 'INSERT' | 'UPDATE' | 'DELETE' | 'WRITE'
  old_value JSONB,
  new_value JSONB,

  -- Status
  status TEXT DEFAULT 'RECORDED',  -- RECORDED | VERIFIED | REVERSED

  -- Recovery
  reversible BOOLEAN DEFAULT FALSE,
  reverse_operation TEXT,
  reversed_at TIMESTAMP WITH TIME ZONE,

  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_effects_run_id ON execution_side_effects(run_id);
CREATE INDEX IF NOT EXISTS idx_effects_step_id ON execution_side_effects(step_id);


-- execution_dependencies: Step ordering and data flow
CREATE TABLE IF NOT EXISTS execution_dependencies (
  id BIGSERIAL PRIMARY KEY,

  -- The dependency edge
  run_id TEXT NOT NULL REFERENCES execution_runs(run_id),
  from_step_id BIGINT NOT NULL REFERENCES execution_journal_steps(id),
  to_step_id BIGINT NOT NULL REFERENCES execution_journal_steps(id),

  -- Metadata
  dependency_type TEXT,  -- 'data_dependency' | 'control_flow' | 'temporal'
  reason TEXT,

  UNIQUE(from_step_id, to_step_id)
);

CREATE INDEX IF NOT EXISTS idx_deps_run_id ON execution_dependencies(run_id);
CREATE INDEX IF NOT EXISTS idx_deps_from_step ON execution_dependencies(from_step_id);
CREATE INDEX IF NOT EXISTS idx_deps_to_step ON execution_dependencies(to_step_id);


-- ============================================================================
-- Extend existing tables with temporal validity columns
-- ============================================================================

ALTER TABLE agent_memory_registry ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE agent_memory_registry ADD COLUMN IF NOT EXISTS valid_to TIMESTAMP WITH TIME ZONE;
ALTER TABLE agent_memory_registry ADD COLUMN IF NOT EXISTS observed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE agent_memory_registry ADD COLUMN IF NOT EXISTS confidence REAL DEFAULT 0.5;
ALTER TABLE agent_memory_registry ADD COLUMN IF NOT EXISTS source_event_id TEXT;
ALTER TABLE agent_memory_registry ADD COLUMN IF NOT EXISTS supersedes_id BIGINT;
ALTER TABLE agent_memory_registry ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_agent_memory_valid_from ON agent_memory_registry(valid_from);
CREATE INDEX IF NOT EXISTS idx_agent_memory_valid_to ON agent_memory_registry(valid_to);
CREATE INDEX IF NOT EXISTS idx_agent_memory_confidence ON agent_memory_registry(confidence);

-- End of migration
