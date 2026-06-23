-- Migration: 0053_agent_memory_refactor_many_to_many.sql
-- Purpose: Correct agent memory architecture per MATM design
-- Refactor: denormalized packets → many-to-many agent_memory_packets table
-- Date: 2026-06-23
-- Note: Drops 0050 attempt; this is the canonical replacement

-- Drop old 0050 (if it exists) — packet_key/source_ref/feature_id will move to agent_memory_packets
DROP TABLE IF EXISTS gpu_eligibility_gate CASCADE;
DROP TABLE IF EXISTS mcp_trace_ownership CASCADE;
DROP TABLE IF EXISTS agent_memory_registry CASCADE;

-- ════════════════════════════════════════════════════════════════════════════════
-- LAYER 0: Task Ownership (Postgres canonical)
-- ════════════════════════════════════════════════════════════════════════════════

-- Registry: one per task/story lifecycle (ownership + metadata)
CREATE TABLE IF NOT EXISTS agent_memory_registry (
  id bigserial PRIMARY KEY,
  task_id text NOT NULL,
  story_id text NOT NULL,
  agent text NOT NULL,
  trace_id text,
  run_id text,
  cache_namespace text,
  cache_source text,
  retrieval_strategy text,
  gpu_eligible boolean DEFAULT false,
  status text NOT NULL DEFAULT 'CLAIMED',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(task_id, agent),
  CHECK (status IN ('CLAIMED','VERIFYING','PASS','SUPERSEDED','FAILED','MANUAL_REVIEW'))
);

CREATE INDEX idx_agent_memory_registry_task_id ON agent_memory_registry(task_id);
CREATE INDEX idx_agent_memory_registry_story_id ON agent_memory_registry(story_id);
CREATE INDEX idx_agent_memory_registry_agent ON agent_memory_registry(agent);
CREATE INDEX idx_agent_memory_registry_status ON agent_memory_registry(status);
CREATE INDEX idx_agent_memory_registry_created_at ON agent_memory_registry(created_at DESC);

-- Many-to-many: packets linked to registry (grain: packet_key, many per task)
-- This avoids denormalization (task_id repeated 13,481 times for large batches)
CREATE TABLE IF NOT EXISTS agent_memory_packets (
  id bigserial PRIMARY KEY,
  registry_id bigint NOT NULL REFERENCES agent_memory_registry(id) ON DELETE CASCADE,
  packet_key text NOT NULL,
  source_ref text,
  feature_id text,
  qdrant_point_id text,
  qdrant_collection text,
  qdrant_vector_dim int,
  retrieval_path jsonb DEFAULT '[]',
  retrieval_layer text,
  topology jsonb DEFAULT '{}',
  manifold4d jsonb DEFAULT '{}',
  superseded_by_packet text,
  superseded_reason text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(registry_id, packet_key)
);

CREATE INDEX idx_agent_memory_packets_registry_id ON agent_memory_packets(registry_id);
CREATE INDEX idx_agent_memory_packets_packet_key ON agent_memory_packets(packet_key);
CREATE INDEX idx_agent_memory_packets_source_ref ON agent_memory_packets(source_ref);
CREATE INDEX idx_agent_memory_packets_feature_id ON agent_memory_packets(feature_id);
CREATE INDEX idx_agent_memory_packets_qdrant_point_id ON agent_memory_packets(qdrant_point_id);
CREATE INDEX idx_agent_memory_packets_created_at ON agent_memory_packets(created_at DESC);
-- GIN for JSONB search on retrieval_path and topology
CREATE INDEX idx_agent_memory_packets_retrieval_path ON agent_memory_packets USING GIN (retrieval_path);
CREATE INDEX idx_agent_memory_packets_topology ON agent_memory_packets USING GIN (topology);

-- ════════════════════════════════════════════════════════════════════════════════
-- LAYER 1: MCP Trace Ownership (Provenance spine, no FK chains)
-- ════════════════════════════════════════════════════════════════════════════════

-- Trace-level causality: indexed trace_id + task_id only (no FK — agents too dynamic)
CREATE TABLE IF NOT EXISTS mcp_trace_ownership (
  id bigserial PRIMARY KEY,
  trace_id text NOT NULL UNIQUE,
  task_id text NOT NULL,
  agent text NOT NULL,
  prompt_hash text,
  tool_calls jsonb DEFAULT '[]',
  packet_keys text[] DEFAULT '{}',
  proof_hash text,
  release_hash text,
  status text DEFAULT 'OPEN',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX idx_mcp_trace_ownership_trace_id ON mcp_trace_ownership(trace_id);
CREATE INDEX idx_mcp_trace_ownership_task_id ON mcp_trace_ownership(task_id);
CREATE INDEX idx_mcp_trace_ownership_agent ON mcp_trace_ownership(agent);
CREATE INDEX idx_mcp_trace_ownership_status ON mcp_trace_ownership(status);
CREATE INDEX idx_mcp_trace_ownership_created_at ON mcp_trace_ownership(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════
-- LAYER 2: GPU Eligibility Gate (Verification checks only, no FK)
-- ════════════════════════════════════════════════════════════════════════════════

-- Verification grain: per-packet (not per-task) — captures identity + proof quality
CREATE TABLE IF NOT EXISTS gpu_eligibility_gate (
  id bigserial PRIMARY KEY,
  task_id text NOT NULL,
  packet_key text NOT NULL,
  identity_stable boolean,
  claim_valid boolean,
  supersedes_passed boolean,
  source_ref_preserved boolean,
  feature_id_preserved boolean,
  retrieval_path_intact boolean,
  qdrant_payload_matches_postgres boolean,
  vector_dim_correct boolean,
  cpu_fallback_exists boolean,
  batch_bounded boolean,
  proof_not_degraded boolean,
  eligible boolean,
  verdict text CHECK (verdict IN ('PASS','FAIL','MANUAL_REVIEW')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_gpu_eligibility_gate_task_id ON gpu_eligibility_gate(task_id);
CREATE INDEX idx_gpu_eligibility_gate_packet_key ON gpu_eligibility_gate(packet_key);
CREATE INDEX idx_gpu_eligibility_gate_eligible ON gpu_eligibility_gate(eligible);
CREATE INDEX idx_gpu_eligibility_gate_verdict ON gpu_eligibility_gate(verdict);
CREATE INDEX idx_gpu_eligibility_gate_created_at ON gpu_eligibility_gate(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════
-- LAYER 3: Retrieval Provenance (Proof & eval times)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS retrieval_provenance (
  id bigserial PRIMARY KEY,
  task_id text NOT NULL,
  trace_id text,
  packet_keys text[] DEFAULT '{}',
  retrieval_path text[] DEFAULT '{}',
  proof_hash text,
  proof_quality real CHECK (proof_quality >= 0.0 AND proof_quality <= 1.0),
  retrieval_source text,
  cpu_latency_ms int,
  gpu_latency_ms int,
  quality_delta real,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_retrieval_provenance_task_id ON retrieval_provenance(task_id);
CREATE INDEX idx_retrieval_provenance_trace_id ON retrieval_provenance(trace_id);
CREATE INDEX idx_retrieval_provenance_created_at ON retrieval_provenance(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════
-- LAYER 4: Retrieval Eval Times (Temporal indexing for proof quality baseline)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS retrieval_eval_times (
  id bigserial PRIMARY KEY,
  task_id text NOT NULL,
  packet_key text NOT NULL,
  retrieval_strategy text,
  cpu_latency_ms int,
  gpu_latency_ms int,
  proof_quality_cpu real CHECK (proof_quality_cpu >= 0.0 AND proof_quality_cpu <= 1.0),
  proof_quality_gpu real CHECK (proof_quality_gpu >= 0.0 AND proof_quality_gpu <= 1.0),
  quality_preserved boolean,
  retrieval_path text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_retrieval_eval_times_task_id ON retrieval_eval_times(task_id);
CREATE INDEX idx_retrieval_eval_times_packet_key ON retrieval_eval_times(packet_key);
CREATE INDEX idx_retrieval_eval_times_created_at ON retrieval_eval_times(created_at DESC);
-- Composite for proof quality baseline lookups
CREATE INDEX idx_retrieval_eval_times_task_created ON retrieval_eval_times(task_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════
-- LAYER 5: Story Proofs (Population-level memory, per MATM)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS atlas_story_proofs (
  id bigserial PRIMARY KEY,
  story_id text NOT NULL,
  proof_hash text NOT NULL UNIQUE,
  retrieval_strategy text,
  agent_list text[] DEFAULT '{}',
  quality_score real CHECK (quality_score >= 0.0 AND quality_score <= 1.0),
  reusable boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_atlas_story_proofs_story_id ON atlas_story_proofs(story_id);
CREATE INDEX idx_atlas_story_proofs_proof_hash ON atlas_story_proofs(proof_hash);
CREATE INDEX idx_atlas_story_proofs_reusable ON atlas_story_proofs(reusable);
CREATE INDEX idx_atlas_story_proofs_created_at ON atlas_story_proofs(created_at DESC);
