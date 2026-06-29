-- Agent Timeline Tracking Schema
-- Canonical event log for autonomous repository intelligence

CREATE TABLE IF NOT EXISTS agent_timeline_events (
  id bigserial PRIMARY KEY,
  trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  metadata jsonb DEFAULT '{}',
  severity text DEFAULT 'info',
  created_at timestamptz DEFAULT now(),
  INDEX idx_trace_id (trace_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at DESC)
);

-- DAG edges: task dependencies, blockers, and relationships
CREATE TABLE IF NOT EXISTS agent_dag_edges (
  id bigserial PRIMARY KEY,
  trace_id uuid NOT NULL,
  from_key text NOT NULL,
  to_key text NOT NULL,
  relation text NOT NULL,
  weight real DEFAULT 1.0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  INDEX idx_from_to (from_key, to_key),
  INDEX idx_trace_id (trace_id)
);

-- Recommendations: scored next actions with evidence
CREATE TABLE IF NOT EXISTS agent_recommendations (
  id bigserial PRIMARY KEY,
  trace_id uuid NOT NULL,
  recommendation text NOT NULL,
  reason text,
  score real DEFAULT 0.0,
  status text DEFAULT 'suggested',
  evidence jsonb DEFAULT '[]',
  accepted boolean,
  outcome text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  INDEX idx_trace_id (trace_id),
  INDEX idx_status (status),
  INDEX idx_score (score DESC)
);

-- Evaluation metrics for learning
CREATE TABLE IF NOT EXISTS agent_eval_metrics (
  id bigserial PRIMARY KEY,
  trace_id uuid NOT NULL,
  metric_name text NOT NULL,
  value real NOT NULL,
  baseline real,
  improvement real,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  INDEX idx_trace_id (trace_id),
  INDEX idx_metric_name (metric_name)
);

-- Policy reranker scores (lane 5 model outputs)
CREATE TABLE IF NOT EXISTS agent_policy_scores (
  id bigserial PRIMARY KEY,
  trace_id uuid NOT NULL,
  candidate_key text NOT NULL,
  score real NOT NULL,
  features jsonb NOT NULL,
  som_cell_id int,
  policy_version text,
  created_at timestamptz DEFAULT now(),
  INDEX idx_trace_id (trace_id),
  INDEX idx_candidate_key (candidate_key),
  INDEX idx_score (score DESC)
);
