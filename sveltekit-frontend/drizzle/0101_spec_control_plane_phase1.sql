-- Spec Control Plane Phase 1: Core Schema
--
-- Authoritative schema for feature lifecycle management:
-- - Projects (top-level container)
-- - Specs (requirements documents)
-- - Features (implementation units)
-- - Tasks (work assignments)
-- - Agent lifecycle tracking
-- - Validation gates + results
-- - Immutable audit trail (workflow_events)

-- Feature state machine (controlled platform contract)
DO $$ BEGIN
  CREATE TYPE feature_state AS ENUM (
    'proposal',
    'specified',
    'planned',
    'ready',
    'claimed',
    'implementing',
    'testing',
    'review_required',
    'validated',
    'merged',
    'released',
    'blocked'
  );
EXCEPTION WHEN duplicate_object THEN
  -- Type already exists, continue
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Core Project & Spec Management
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  spec_key TEXT NOT NULL,
  title TEXT NOT NULL,
  current_revision_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, spec_key)
);

CREATE TABLE IF NOT EXISTS spec_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id UUID NOT NULL REFERENCES specs(id) ON DELETE CASCADE,
  revision_number INT NOT NULL,
  content JSONB NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (spec_id, revision_number)
);

-- Add foreign key constraint after table creation (self-referential)
ALTER TABLE specs
  ADD CONSTRAINT specs_current_revision_fk
  FOREIGN KEY (current_revision_id)
  REFERENCES spec_revisions(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- Feature & Requirement Management
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  spec_id UUID REFERENCES specs(id) ON DELETE SET NULL,
  feature_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  state feature_state NOT NULL DEFAULT 'proposal',
  version INT NOT NULL DEFAULT 1,
  claimed_by UUID,
  blocked_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, feature_key)
);

CREATE TABLE IF NOT EXISTS feature_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  requirement_key TEXT NOT NULL,
  requirement_text TEXT NOT NULL,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feature_id, requirement_key)
);

-- ═══════════════════════════════════════════════════════════════
-- Task & Work Assignment
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'in_progress', 'completed', 'failed', 'blocked')
  ),
  assigned_agent_id UUID,
  dependencies UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feature_id, task_key)
);

-- ═══════════════════════════════════════════════════════════════
-- Agent Lifecycle & Execution
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  model TEXT,
  tool_policy JSONB NOT NULL DEFAULT '{}',
  permissions JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_definition_id UUID REFERENCES agent_definitions(id) ON DELETE SET NULL,
  feature_id UUID REFERENCES features(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  ),
  trace_id TEXT,
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB,
  error JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  step_type TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('pending', 'running', 'completed', 'failed', 'skipped')
  ),
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB,
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (agent_run_id, step_number)
);

-- ═══════════════════════════════════════════════════════════════
-- Immutable Audit Trail (NEVER DELETE)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE RESTRICT,
  from_state feature_state NOT NULL,
  to_state feature_state NOT NULL,
  actor_type TEXT NOT NULL CHECK (
    actor_type IN ('user', 'agent', 'system')
  ),
  actor_id TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent any modification of workflow_events
CREATE TRIGGER workflow_events_immutable BEFORE UPDATE OR DELETE ON workflow_events
FOR EACH ROW EXECUTE FUNCTION raise_immutability_error();

-- ═══════════════════════════════════════════════════════════════
-- Validation Gates & Results
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS validation_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  gate_key TEXT NOT NULL,
  name TEXT NOT NULL,
  required_for_state feature_state,
  evaluator_type TEXT NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (project_id, gate_key)
);

CREATE TABLE IF NOT EXISTS validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id UUID NOT NULL REFERENCES validation_gates(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  passed BOOLEAN NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  details JSONB NOT NULL DEFAULT '{}',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- Artifacts & Approvals
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  artifact_type TEXT NOT NULL,
  uri TEXT NOT NULL,
  content_hash CHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'approved', 'rejected', 'revoked')
  ),
  approver_id TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- Helper Functions
-- ═══════════════════════════════════════════════════════════════

-- Prevent modifications to immutable audit table
CREATE OR REPLACE FUNCTION raise_immutability_error()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'workflow_events table is immutable';
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- Indexes for Query Performance
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS projects_created_at_idx ON projects(created_at);
CREATE INDEX IF NOT EXISTS specs_project_id_idx ON specs(project_id);
CREATE INDEX IF NOT EXISTS features_project_id_idx ON features(project_id);
CREATE INDEX IF NOT EXISTS features_state_idx ON features(state);
CREATE INDEX IF NOT EXISTS tasks_feature_id_idx ON tasks(feature_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
CREATE INDEX IF NOT EXISTS agent_runs_feature_id_idx ON agent_runs(feature_id);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs(status);
CREATE INDEX IF NOT EXISTS workflow_events_feature_id_idx ON workflow_events(feature_id);
CREATE INDEX IF NOT EXISTS workflow_events_created_at_idx ON workflow_events(created_at);
CREATE INDEX IF NOT EXISTS validation_results_feature_id_idx ON validation_results(feature_id);
CREATE INDEX IF NOT EXISTS validation_results_evaluated_at_idx ON validation_results(evaluated_at);
