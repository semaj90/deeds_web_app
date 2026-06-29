-- Phase 5: Agent OS Registry Tables
-- Created: June 29, 2026
-- Purpose: Track task execution, GPU candidate evaluation, and agent OS events

-- Task Registry: ground truth for all task executions
CREATE TABLE IF NOT EXISTS task_registry (
  task_id uuid PRIMARY KEY,
  task_type text NOT NULL,
  status text NOT NULL,
  payload jsonb DEFAULT '{}',
  result jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_registry_status ON task_registry(status);
CREATE INDEX IF NOT EXISTS idx_task_registry_task_type ON task_registry(task_type);
CREATE INDEX IF NOT EXISTS idx_task_registry_created_at ON task_registry(created_at DESC);

-- GPU Candidate Evaluation: ranking results from retrieval + reranking
CREATE TABLE IF NOT EXISTS gpu_candidate_eval (
  eval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid,
  packet_id text,
  candidate_rank int,
  semantic_score real,
  summary_score real,
  signature_score real,
  latent_distance real,
  som_distance real,
  cluster_id int,
  gpu_latency_ms real,
  index_name text,
  model_version text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gpu_candidate_eval_trace_id ON gpu_candidate_eval(trace_id);
CREATE INDEX IF NOT EXISTS idx_gpu_candidate_eval_packet_id ON gpu_candidate_eval(packet_id);
CREATE INDEX IF NOT EXISTS idx_gpu_candidate_eval_semantic_score ON gpu_candidate_eval(semantic_score DESC);
CREATE INDEX IF NOT EXISTS idx_gpu_candidate_eval_created_at ON gpu_candidate_eval(created_at DESC);

-- Agent OS Events: timeline of all agentic system events
CREATE TABLE IF NOT EXISTS agent_os_events (
  id bigserial PRIMARY KEY,
  trace_id uuid,
  event_type text,
  source text,
  title text,
  body text,
  severity text,
  feature_id text,
  packet_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_os_events_trace_id ON agent_os_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_os_events_event_type ON agent_os_events(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_os_events_severity ON agent_os_events(severity);
CREATE INDEX IF NOT EXISTS idx_agent_os_events_created_at ON agent_os_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_os_events_source ON agent_os_events(source);
