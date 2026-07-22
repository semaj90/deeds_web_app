-- Phase 107 F: PageRank Authority Schema Extensions
-- Adds topology metrics versioning and computation run tracking

-- 1. Extend atlas_topology_index with PageRank fields (non-blocking)
ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_raw double precision;

ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_percentile double precision;

ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS authority_score double precision;

ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS authority_band text;

ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_run_id uuid;

ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_contract_version text;

ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS graph_snapshot_hash text;

ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_computed_at timestamptz;

-- 2. Add constraints (non-blocking for migration)
ALTER TABLE atlas_topology_index
  ADD CONSTRAINT atlas_topology_pagerank_raw_nonnegative
  CHECK (
    pagerank_raw IS NULL
    OR pagerank_raw >= 0
  )
  NOT VALID;

ALTER TABLE atlas_topology_index
  ADD CONSTRAINT atlas_topology_pagerank_percentile_range
  CHECK (
    pagerank_percentile IS NULL
    OR pagerank_percentile BETWEEN 0 AND 1
  )
  NOT VALID;

ALTER TABLE atlas_topology_index
  ADD CONSTRAINT atlas_topology_authority_score_range
  CHECK (
    authority_score IS NULL
    OR authority_score BETWEEN 0 AND 1
  )
  NOT VALID;

ALTER TABLE atlas_topology_index
  ADD CONSTRAINT atlas_topology_authority_band_allowed
  CHECK (
    authority_band IS NULL
    OR authority_band IN (
      'none',
      'low',
      'medium',
      'high',
      'critical'
    )
  )
  NOT VALID;

-- 3. Create graph algorithm run manifest table
CREATE TABLE IF NOT EXISTS atlas_graph_algorithm_runs (
  run_id uuid PRIMARY KEY,

  algorithm text NOT NULL,
  implementation text NOT NULL,
  contract_version text NOT NULL,

  graph_snapshot_id text NOT NULL,
  graph_snapshot_hash text NOT NULL,

  node_count integer NOT NULL,
  edge_count integer NOT NULL,

  parameters jsonb NOT NULL,
  relationship_policy jsonb NOT NULL,

  converged boolean NOT NULL,
  actual_iterations integer NOT NULL,

  evaluation jsonb NOT NULL,

  status text NOT NULL CHECK (
    status IN (
      'started',
      'computed',
      'validated',
      'materialized',
      'failed',
      'rejected'
    )
  ),

  started_at timestamptz NOT NULL,
  completed_at timestamptz,

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS atlas_graph_algorithm_runs_status_idx
  ON atlas_graph_algorithm_runs (status);

CREATE INDEX IF NOT EXISTS atlas_graph_algorithm_runs_algorithm_idx
  ON atlas_graph_algorithm_runs (algorithm, started_at DESC);

CREATE INDEX IF NOT EXISTS atlas_graph_algorithm_runs_graph_snapshot_idx
  ON atlas_graph_algorithm_runs (graph_snapshot_hash);
