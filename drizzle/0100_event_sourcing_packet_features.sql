-- Phase 5 Extension: Event Sourcing + Packet Features Consolidation
-- Created: June 29, 2026 (Session 94 Continuation)
-- Purpose: Implement 4-layer architecture with immutable event log + GPU feature consolidation

-- ============================================================================
-- LAYER 1: IMMUTABLE EVENT LOG (truth source for all events)
-- ============================================================================

-- Extended agent_os_events with correlation tracking
ALTER TABLE agent_os_events ADD COLUMN IF NOT EXISTS correlation_id uuid;
ALTER TABLE agent_os_events ADD COLUMN IF NOT EXISTS parent_event_id bigint;
ALTER TABLE agent_os_events ADD COLUMN IF NOT EXISTS event_sequence int;
ALTER TABLE agent_os_events ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE agent_os_events ADD COLUMN IF NOT EXISTS resolution_metadata jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_agent_os_events_correlation_id ON agent_os_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_agent_os_events_parent_event_id ON agent_os_events(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_agent_os_events_resolved_at ON agent_os_events(resolved_at DESC) WHERE resolved_at IS NOT NULL;

-- Context Timeline Events (user signals for Engram feedback)
CREATE TABLE IF NOT EXISTS context_timeline_events (
  id bigserial PRIMARY KEY,
  correlation_id uuid NOT NULL,
  user_id uuid,
  session_id uuid,
  event_type text NOT NULL, -- research | feedback | citation | graph_edge | rl_adapt | tool_call | summary | error
  pipeline text, -- ace | kag | rag | hybrid
  signal text, -- thumbs_up | thumbs_down | dwell | citation_saved | correction
  grpo_reward real,
  pipeline_weight_after real,
  triggered_rebuild boolean DEFAULT false,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_context_timeline_correlation_id ON context_timeline_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_context_timeline_user_id ON context_timeline_events(user_id);
CREATE INDEX IF NOT EXISTS idx_context_timeline_event_type ON context_timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_context_timeline_signal ON context_timeline_events(signal);
CREATE INDEX IF NOT EXISTS idx_context_timeline_created_at ON context_timeline_events(created_at DESC);

-- GPU Compute Events (AE, SOM, Attention, PageRank, Policy)
CREATE TABLE IF NOT EXISTS gpu_compute_events (
  id bigserial PRIMARY KEY,
  correlation_id uuid NOT NULL,
  compute_type text NOT NULL, -- autoencoder_encode | som_train | attention_score | pagerank | policy_eval
  packet_id text,
  compute_input jsonb, -- shape, batch_size, precision
  compute_output jsonb, -- results, timing, status
  gpu_latency_ms real,
  gpu_memory_mb real,
  model_version text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gpu_compute_events_correlation_id ON gpu_compute_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_gpu_compute_events_compute_type ON gpu_compute_events(compute_type);
CREATE INDEX IF NOT EXISTS idx_gpu_compute_events_packet_id ON gpu_compute_events(packet_id);
CREATE INDEX IF NOT EXISTS idx_gpu_compute_events_created_at ON gpu_compute_events(created_at DESC);

-- ============================================================================
-- LAYER 2: PROJECTIONS (rebuilt from immutable events on demand)
-- ============================================================================

-- CRITICAL: Consolidated packet_features table (NOT scattered)
-- This replaces scattered feature columns in atlas_packets and eliminates data drift
CREATE TABLE IF NOT EXISTS packet_features (
  packet_id text PRIMARY KEY,
  -- Embedding vectors (immutable)
  summary_embedding vector(768), -- from Gemma4 summary
  content_embedding vector(768), -- from content hash
  signature_embedding vector(768), -- from function signature

  -- Latent features (GPU-computed, mutable)
  latent64 vector(64), -- autoencoder compression (768→64)
  latent128 vector(128), -- optional larger latent

  -- SOM & Clustering (mutable)
  som_cell_x int, -- SOM grid position X
  som_cell_y int, -- SOM grid position Y
  som_distance real, -- distance to BMU
  cluster_id int, -- GPU k-means cluster

  -- Scoring (mutable, computed from events)
  authority_score real DEFAULT 0.0, -- from Neo4j PageRank
  pagerank_score real DEFAULT 0.0, -- from graph computation
  attention_score real DEFAULT 0.0, -- from attention gate
  policy_score real DEFAULT 0.0, -- from RL policy

  -- Metadata
  last_gpu_refresh timestamptz DEFAULT now(),
  last_attention_refresh timestamptz,
  gpu_refresh_reason text, -- initial | incremental | rerank | policy_update
  status text DEFAULT 'valid', -- valid | stale | error | computing

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packet_features_som_cell ON packet_features(som_cell_x, som_cell_y);
CREATE INDEX IF NOT EXISTS idx_packet_features_cluster_id ON packet_features(cluster_id);
CREATE INDEX IF NOT EXISTS idx_packet_features_authority_score ON packet_features(authority_score DESC);
CREATE INDEX IF NOT EXISTS idx_packet_features_policy_score ON packet_features(policy_score DESC);
CREATE INDEX IF NOT EXISTS idx_packet_features_status ON packet_features(status);
CREATE INDEX IF NOT EXISTS idx_packet_features_last_gpu_refresh ON packet_features(last_gpu_refresh DESC);

-- Projection: Task State (rebuilt from task_registry + agent_os_events)
CREATE TABLE IF NOT EXISTS task_state_projection (
  task_id uuid PRIMARY KEY,
  task_type text NOT NULL,
  status text NOT NULL, -- executing | completed | failed | pending
  outcome text, -- success | error | partial
  priority real DEFAULT 0.5,
  blocking_task_ids uuid[] DEFAULT '{}',
  payload jsonb DEFAULT '{}',
  result jsonb DEFAULT '{}',
  metrics jsonb DEFAULT '{}', -- duration, tokens, cost, cache_hit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_state_projection_status ON task_state_projection(status);
CREATE INDEX IF NOT EXISTS idx_task_state_projection_priority ON task_state_projection(priority DESC);
CREATE INDEX IF NOT EXISTS idx_task_state_projection_updated_at ON task_state_projection(updated_at DESC);

-- Projection: Engram Recall (rebuilt from context_timeline_events + intent_eval_runs)
CREATE TABLE IF NOT EXISTS engram_recall_projection (
  memory_id uuid PRIMARY KEY,
  user_intent text,
  scope text, -- session | user | global
  summary text,
  labels text[] DEFAULT '{}',
  hotness real DEFAULT 0.0, -- computed from signal frequency
  last_accessed timestamptz,
  access_count int DEFAULT 0,
  grpo_reward_total real DEFAULT 0.0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engram_recall_hotness ON engram_recall_projection(hotness DESC);
CREATE INDEX IF NOT EXISTS idx_engram_recall_user_intent ON engram_recall_projection(user_intent);
CREATE INDEX IF NOT EXISTS idx_engram_recall_scope ON engram_recall_projection(scope);

-- ============================================================================
-- LAYER 3: GPU FEATURES (output of Layer 1 events, input to Layer 4 cache)
-- ============================================================================

-- GPU Feature Cache (pre-computed results for reuse)
CREATE TABLE IF NOT EXISTS gpu_feature_cache (
  cache_key text PRIMARY KEY, -- sha256(compute_type + input_hash)
  compute_type text NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  result_vector vector(768), -- if applicable
  latency_ms real,
  hit_count int DEFAULT 1,
  last_accessed timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gpu_feature_cache_compute_type ON gpu_feature_cache(compute_type);
CREATE INDEX IF NOT EXISTS idx_gpu_feature_cache_expires_at ON gpu_feature_cache(expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_gpu_feature_cache_hit_count ON gpu_feature_cache(hit_count DESC);

-- ============================================================================
-- LAYER 4: RUNTIME CACHE (Valkey/Redis via NATS pub/sub invalidation)
-- ============================================================================
-- (Defined in Redis/Valkey, not Postgres — but schema constraints documented here)
-- Key patterns:
--   bifrost:packet:{packet_id} → JSON packet_features
--   bifrost:task:{task_id} → JSON task_state_projection
--   bifrost:engram:{memory_id} → JSON engram_recall_projection
--   centroid:feature:{feature_id} → centroid vector (768)
--   centroid:som:{som_cell} → centroid for SOM cell
-- TTL: 7-14 days, invalidated on write via agent_os_events → NATS publish

-- ============================================================================
-- AGENT SCHEDULER FOUNDATION
-- ============================================================================

-- Unified Agent Scheduler: coordinates all async work (not separate TODO Aggregator)
CREATE TABLE IF NOT EXISTS agent_scheduler_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL, -- index_codebase | gpu_refresh | rl_rerank | summary_generation | graph_refresh | health_audit
  priority int DEFAULT 50, -- 0-100, higher = sooner
  depends_on uuid[] DEFAULT '{}',
  assigned_worker text, -- which service owns it (langraph | gpu-worker | indexer)
  status text DEFAULT 'pending', -- pending | queued | executing | completed | failed
  attempts int DEFAULT 0,
  max_attempts int DEFAULT 3,
  payload jsonb DEFAULT '{}',
  result jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_scheduler_jobs_status ON agent_scheduler_jobs(status);
CREATE INDEX IF NOT EXISTS idx_agent_scheduler_jobs_priority ON agent_scheduler_jobs(priority DESC);
CREATE INDEX IF NOT EXISTS idx_agent_scheduler_jobs_created_at ON agent_scheduler_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_scheduler_jobs_assigned_worker ON agent_scheduler_jobs(assigned_worker);

-- Startup Review: What happened since last boot (feeds Agent OS recommendations)
CREATE TABLE IF NOT EXISTS startup_review_state (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boot_timestamp timestamptz NOT NULL,
  git_state jsonb, -- branch, commits ahead, dirty files, last push
  session_summaries jsonb DEFAULT '{}', -- previous sessions (max 5)
  signal_metrics jsonb DEFAULT '{}', -- from_agent_os_events aggregated
  blocker_count int DEFAULT 0,
  recommendation_score real DEFAULT 0.0,
  recommendations jsonb DEFAULT '[]', -- top N tasks ranked
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_startup_review_boot_timestamp ON startup_review_state(boot_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_startup_review_recommendation_score ON startup_review_state(recommendation_score DESC);

-- ============================================================================
-- VALIDATION & CONSTRAINTS
-- ============================================================================

-- Foreign key: packet_features → atlas_packets (if atlas_packets exists)
-- This ensures packet_features stays in sync with packet identity
ALTER TABLE packet_features ADD CONSTRAINT fk_packet_features_identity
  FOREIGN KEY (packet_id) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE;

-- Ensure GPU events reference valid compute types
ALTER TABLE gpu_compute_events ADD CONSTRAINT check_compute_type_valid
  CHECK (compute_type IN ('autoencoder_encode', 'som_train', 'attention_score', 'pagerank', 'policy_eval'));

-- Ensure context timeline signals are valid
ALTER TABLE context_timeline_events ADD CONSTRAINT check_signal_valid
  CHECK (signal IS NULL OR signal IN ('thumbs_up', 'thumbs_down', 'dwell', 'citation_saved', 'correction'));