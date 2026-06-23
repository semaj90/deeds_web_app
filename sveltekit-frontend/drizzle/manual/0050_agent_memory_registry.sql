-- Migration: 0050_agent_memory_registry.sql
-- Purpose: P1-P4 agent ownership + trace + GPU eligibility infrastructure
-- Date: 2026-06-23

-- P1: Agent Memory Registry — Ownership + Claim Spine
CREATE TABLE IF NOT EXISTS agent_memory_registry (
  id bigserial primary key,

  -- Task & Story
  task_id text not null,
  story_id text not null,

  -- Agent Ownership
  agent text not null,

  -- Trace Chain
  trace_id text,
  run_id text,

  -- Packet Identity (frozen from Atlas)
  packet_key text,
  source_ref text,
  feature_id text,

  -- Retrieval Layer
  cache_namespace text,
  cache_source text,  -- 'hyperrag_fusion', 'kag_retrieval', 'dag_traversal'
  retrieval_strategy text,

  -- Supersession
  supersedes_task_id text,
  supersedes_packet_keys text[],  -- multiple packets may be superseded
  supersedes_reason text,

  -- GPU Eligibility
  gpu_eligible boolean default false,

  -- Status
  status text not null default 'CLAIMED',  -- CLAIMED | VERIFYING | PASS | SUPERSEDED | FAILED | MANUAL_REVIEW

  -- Metadata
  metadata jsonb default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint agent_task_unique unique(task_id, agent),
  constraint valid_status check(status in ('CLAIMED', 'VERIFYING', 'PASS', 'SUPERSEDED', 'FAILED', 'MANUAL_REVIEW'))
);

CREATE INDEX idx_agent_memory_task_id on agent_memory_registry(task_id);
CREATE INDEX idx_agent_memory_story_id on agent_memory_registry(story_id);
CREATE INDEX idx_agent_memory_agent on agent_memory_registry(agent);
CREATE INDEX idx_agent_memory_packet_key on agent_memory_registry(packet_key);
CREATE INDEX idx_agent_memory_feature_id on agent_memory_registry(feature_id);
CREATE INDEX idx_agent_memory_source_ref on agent_memory_registry(source_ref);
CREATE INDEX idx_agent_memory_status on agent_memory_registry(status);
CREATE INDEX idx_agent_memory_created_at on agent_memory_registry(created_at);

-- P3: MCP Trace Ownership Chain
CREATE TABLE IF NOT EXISTS mcp_trace_ownership (
  id bigserial primary key,

  trace_id text not null unique,
  task_id text not null,
  agent text not null,

  -- Trace Chain
  prompt_hash text,
  tool_calls text[],
  packet_keys text[],
  proof_hash text,
  release_hash text,

  -- Status
  status text default 'OPEN',  -- OPEN | CLOSED | FAILED

  metadata jsonb default '{}',

  created_at timestamptz default now(),
  closed_at timestamptz
);

CREATE INDEX idx_mcp_trace_task_id on mcp_trace_ownership(task_id);
CREATE INDEX idx_mcp_trace_agent on mcp_trace_ownership(agent);
CREATE INDEX idx_mcp_trace_status on mcp_trace_ownership(status);

-- P4: GPU Eligibility Gate (Verification)
CREATE TABLE IF NOT EXISTS gpu_eligibility_gate (
  id bigserial primary key,

  task_id text not null,
  packet_key text not null,

  -- Verification Checks
  identity_stable boolean,
  vector_dim_correct boolean,
  batch_bounded boolean,
  cpu_fallback_exists boolean,
  claim_valid boolean,
  proof_valid boolean,

  -- Overall Result
  eligible boolean,
  verdict text,  -- PASS | FAIL | MANUAL_REVIEW

  metadata jsonb default '{}',

  created_at timestamptz default now()
);

CREATE INDEX idx_gpu_gate_task_id on gpu_eligibility_gate(task_id);
CREATE INDEX idx_gpu_gate_packet_key on gpu_eligibility_gate(packet_key);
CREATE INDEX idx_gpu_gate_eligible on gpu_eligibility_gate(eligible);
