-- Migration: 0051_evaluation_registry.sql
-- Purpose: Agent evaluation registry — "do not repeat ourselves" pattern
-- Tracks: function effectiveness, path selection, tool fit, task outcomes
-- Date: 2026-06-23

-- Task-Function Effectiveness Registry
CREATE TABLE IF NOT EXISTS task_function_evals (
  id bigserial primary key,

  -- Task Identity
  task_id text not null,
  story_id text not null,

  -- Function Being Tested
  function_name text not null,        -- e.g., 'go-retrieval', 'gemma4-toolcall', 'kmeans-topology'
  function_category text not null,    -- 'retrieval' | 'inference' | 'clustering' | 'validation'

  -- Execution Context
  input_shape text not null,          -- 'packet_array', 'query_vector', 'graph_node', etc.
  input_count integer,                -- number of items processed
  output_shape text,                  -- shape of result
  output_count integer,

  -- Performance
  latency_ms integer,                 -- execution time
  throughput_items_per_sec real,
  memory_peak_mb integer,

  -- Correctness
  accuracy real,                      -- 0.0-1.0 (GAN validation score)
  matches_expected boolean,           -- exact match check
  error_rate real,                    -- 0.0-1.0

  -- Quality Metrics
  confidence real,                    -- 0.0-1.0 (should I use this again?)
  repeat_score real,                  -- 0.0-1.0 (how often does this work for similar tasks?)

  -- Metadata
  metadata jsonb default '{}',

  created_at timestamptz default now(),
  constraint valid_category check(function_category in ('retrieval', 'inference', 'clustering', 'validation'))
);

CREATE INDEX idx_task_function_evals_task_id on task_function_evals(task_id);
CREATE INDEX idx_task_function_evals_function on task_function_evals(function_name);
CREATE INDEX idx_task_function_evals_category on task_function_evals(function_category);
CREATE INDEX idx_task_function_evals_confidence on task_function_evals(confidence);

-- Domain-Function Mapping (best fit for given domain/problem type)
CREATE TABLE IF NOT EXISTS domain_function_mapping (
  id bigserial primary key,

  -- Domain Identification
  domain text not null,               -- 'codebase_retrieval', 'evidence_search', 'graph_traversal', etc.
  problem_type text not null,         -- 'dense_search', 'sparse_lookup', 'clustering', 'ranking'

  -- Optimal Function
  function_name text not null,
  function_category text not null,

  -- Ranking
  rank integer,                       -- 1 = best fit, 2 = second choice, etc.
  confidence real,                    -- 0.0-1.0 fit confidence
  reasoning text,                     -- why this function is best

  -- Performance Baseline
  expected_latency_ms integer,
  expected_throughput_items_per_sec real,
  expected_accuracy real,

  -- Alternative Paths (fallback chain)
  alternatives text[],                -- ['function_b', 'function_c'] ranked by performance

  metadata jsonb default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint domain_problem_function_unique unique(domain, problem_type, function_name)
);

CREATE INDEX idx_domain_function_mapping_domain on domain_function_mapping(domain);
CREATE INDEX idx_domain_function_mapping_problem on domain_function_mapping(problem_type);
CREATE INDEX idx_domain_function_mapping_rank on domain_function_mapping(rank);

-- Path Selection History (what was chosen, what worked)
CREATE TABLE IF NOT EXISTS path_selection_history (
  id bigserial primary key,

  -- Decision Context
  task_id text not null,
  story_id text not null,
  agent text not null,

  -- The Path Taken
  domain text not null,
  problem_type text not null,
  selected_function text not null,
  selected_rank integer,              -- was this 1st choice, fallback, etc.?

  -- Result
  success boolean,
  latency_ms integer,
  accuracy real,
  output_quality real,                -- 0.0-1.0 (GAN validation)

  -- Learning
  should_repeat boolean,              -- use this path again for similar tasks?
  reason_if_not text,                 -- why not repeat this

  metadata jsonb default '{}',

  created_at timestamptz default now()
);

CREATE INDEX idx_path_selection_task_id on path_selection_history(task_id);
CREATE INDEX idx_path_selection_domain on path_selection_history(domain);
CREATE INDEX idx_path_selection_success on path_selection_history(success);
CREATE INDEX idx_path_selection_should_repeat on path_selection_history(should_repeat);

-- Schema Matching Registry (Redis topology ↔ Postgres schema alignment)
CREATE TABLE IF NOT EXISTS schema_match_registry (
  id bigserial primary key,

  -- Entity Being Matched
  entity_type text not null,          -- 'packet', 'feature', 'cluster', 'concept'
  entity_id text not null,

  -- Redis KMeans Topology Match
  kmeans_cluster_id integer,
  som_row integer,
  som_col integer,
  topology_confidence real,           -- 0.0-1.0 (how certain is this mapping?)

  -- Postgres Canonical Match
  canonical_table text,               -- 'atlas_packets', 'atlas_features', etc.
  canonical_row_id uuid,

  -- Qdrant Mirror Match
  qdrant_collection text,
  qdrant_point_id text,

  -- CouchDB Source Match
  couchdb_doc_id text,

  -- Traversal Metadata
  traversal_cost integer,             -- hops to reach from root
  is_optimal boolean,                 -- is this the fastest path?
  alternative_paths integer,          -- how many other paths exist?

  metadata jsonb default '{}',

  created_at timestamptz default now(),
  constraint schema_match_unique unique(entity_type, entity_id)
);

CREATE INDEX idx_schema_match_entity on schema_match_registry(entity_type, entity_id);
CREATE INDEX idx_schema_match_kmeans on schema_match_registry(kmeans_cluster_id);
CREATE INDEX idx_schema_match_canonical on schema_match_registry(canonical_table, canonical_row_id);
CREATE INDEX idx_schema_match_qdrant on schema_match_registry(qdrant_collection, qdrant_point_id);
CREATE INDEX idx_schema_match_couchdb on schema_match_registry(couchdb_doc_id);

-- GAN Validation Registry (did the feature actually work?)
CREATE TABLE IF NOT EXISTS gan_validation_registry (
  id bigserial primary key,

  -- Feature Being Validated
  feature_name text not null,         -- e.g., 'kmeans_topology_routing', 'dense_search_rerank'
  feature_version text,
  feature_category text,              -- 'retrieval', 'ranking', 'clustering', 'optimization'

  -- Validation Test
  test_id text not null,
  test_input jsonb,                   -- what did we test with?
  expected_output jsonb,
  actual_output jsonb,

  -- Scoring
  gan_score real,                     -- 0.0-1.0 (discriminator confidence in quality)
  matches_expected boolean,
  quality_passes boolean,             -- is output good enough to use?

  -- Actionability
  is_production_ready boolean,        -- safe to use in real tasks?
  blocking_issues text[],             -- what needs to be fixed?
  recommended_actions text[],         -- how to fix

  metadata jsonb default '{}',

  created_at timestamptz default now(),
  constraint gan_validation_unique unique(feature_name, test_id)
);

CREATE INDEX idx_gan_validation_feature on gan_validation_registry(feature_name);
CREATE INDEX idx_gan_validation_category on gan_validation_registry(feature_category);
CREATE INDEX idx_gan_validation_ready on gan_validation_registry(is_production_ready);
CREATE INDEX idx_gan_validation_score on gan_validation_registry(gan_score DESC);
