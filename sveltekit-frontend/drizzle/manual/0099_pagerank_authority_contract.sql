-- PageRank Authority Contract Tables (Versioned L1Norm Normalization)
-- Contract Version: atlas.pagerank-authority.v1
-- Separates raw PageRank from L1-normalized authority scores

-- Run-level table for batch validation
CREATE TABLE IF NOT EXISTS atlas_graph_authority_runs (
  run_id uuid PRIMARY KEY,
  graph_snapshot_id uuid NOT NULL,
  algorithm text NOT NULL
    CHECK (algorithm = 'pagerank'),
  normalization_method text NOT NULL
    CHECK (
      normalization_method = 'L1Norm'
    ),
  expected_l1_sum double precision NOT NULL
    DEFAULT 1,
  observed_l1_sum double precision NOT NULL,
  normalization_tolerance double precision NOT NULL,

  did_converge boolean NOT NULL,
  ran_iterations integer NOT NULL,
  node_count integer NOT NULL,
  status text NOT NULL
    CHECK (
      status IN (
        'building',
        'validating',
        'passed',
        'failed',
        'promoted'
      )
    ),

  created_at timestamptz NOT NULL,
  promoted_at timestamptz
);

-- Row-level table for individual node authority scores
CREATE TABLE IF NOT EXISTS atlas_graph_authority_scores (
  graph_snapshot_id uuid NOT NULL,
  run_id uuid NOT NULL,
  node_key text NOT NULL,
  packet_key text,
  source_ref text,
  pagerank_raw double precision NOT NULL
    CHECK (
      isfinite(pagerank_raw)
      AND pagerank_raw >= 0
    ),
  pagerank_l1 double precision NOT NULL
    CHECK (
      isfinite(pagerank_l1)
      AND pagerank_l1 >= 0
      AND pagerank_l1 <= 1
    ),
  authority_percentile double precision NOT NULL
    CHECK (
      authority_percentile >= 0
      AND authority_percentile <= 1
    ),

  authority_band text NOT NULL
    CHECK (
      authority_band IN (
        'very-low',
        'low',
        'medium',
        'high',
        'very-high'
      )
    ),
  normalization_method text NOT NULL
    CHECK (
      normalization_method = 'L1Norm'
    ),
  normalization_applied_by text NOT NULL,
  damping_factor double precision NOT NULL,
  max_iterations integer NOT NULL,
  tolerance double precision NOT NULL,

  did_converge boolean NOT NULL,
  ran_iterations integer NOT NULL,
  contract_version text NOT NULL
    CHECK (
      contract_version =
        'atlas.pagerank-authority.v1'
    ),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (
    graph_snapshot_id,
    node_key
  )
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_authority_scores_run_id
  ON atlas_graph_authority_scores(run_id);

CREATE INDEX IF NOT EXISTS idx_authority_scores_percentile
  ON atlas_graph_authority_scores(authority_percentile DESC);

CREATE INDEX IF NOT EXISTS idx_authority_scores_band
  ON atlas_graph_authority_scores(authority_band);

CREATE INDEX IF NOT EXISTS idx_authority_scores_packet_key
  ON atlas_graph_authority_scores(packet_key)
  WHERE packet_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_authority_scores_source_ref
  ON atlas_graph_authority_scores(source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_authority_runs_status
  ON atlas_graph_authority_runs(status);

CREATE INDEX IF NOT EXISTS idx_authority_runs_graph_snapshot
  ON atlas_graph_authority_runs(graph_snapshot_id);
