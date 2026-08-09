-- Graph Analysis Run/Promotion Contract — Patch B (persistence).
-- See openspec/changes/parent-atlas-graph-analysis-contract for the architecture.
-- These four tables are the ANALYSIS layer. They never add columns to atlas_packets.
-- All statements are idempotent (IF NOT EXISTS) per this repo's manual-migration convention.

CREATE TABLE IF NOT EXISTS graph_analysis_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  algorithm text NOT NULL,
  algorithm_revision text NOT NULL,
  parameter_revision text NOT NULL,
  workspace_revision text NOT NULL,
  source_revision text NOT NULL,
  graph_revision text NOT NULL,
  projection_revision text NOT NULL,
  projection_name text NOT NULL,
  node_count bigint NOT NULL,
  relationship_count bigint NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS graph_analysis_runs_algorithm_idx ON graph_analysis_runs (algorithm, started_at);
CREATE INDEX IF NOT EXISTS graph_analysis_runs_graph_revision_idx ON graph_analysis_runs (graph_revision);
CREATE INDEX IF NOT EXISTS graph_analysis_runs_status_idx ON graph_analysis_runs (status);

CREATE TABLE IF NOT EXISTS graph_node_metrics (
  run_id uuid NOT NULL,
  packet_key text NOT NULL,
  symbol_version_id text,
  metric_name text NOT NULL,
  metric_value double precision NOT NULL,
  graph_revision text NOT NULL,
  algorithm_revision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, packet_key, metric_name)
);

CREATE INDEX IF NOT EXISTS graph_node_metrics_packet_idx ON graph_node_metrics (packet_key, metric_name);
CREATE INDEX IF NOT EXISTS graph_node_metrics_run_idx ON graph_node_metrics (run_id);
CREATE INDEX IF NOT EXISTS graph_node_metrics_graph_revision_idx ON graph_node_metrics (graph_revision, metric_name);

CREATE TABLE IF NOT EXISTS graph_community_assignments (
  run_id uuid NOT NULL,
  packet_key text NOT NULL,
  algorithm text NOT NULL,
  community_id text NOT NULL,
  level integer,
  graph_revision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, packet_key)
);

CREATE INDEX IF NOT EXISTS graph_community_assignments_community_idx ON graph_community_assignments (algorithm, community_id);
CREATE INDEX IF NOT EXISTS graph_community_assignments_packet_idx ON graph_community_assignments (packet_key);
CREATE INDEX IF NOT EXISTS graph_community_assignments_run_idx ON graph_community_assignments (run_id);

CREATE TABLE IF NOT EXISTS graph_communities (
  run_id uuid NOT NULL,
  algorithm text NOT NULL,
  community_id text NOT NULL,
  parent_community_id text,
  member_count integer NOT NULL,
  representative_packet_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  representative_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  label text,
  purity double precision,
  modularity_contribution double precision,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, algorithm, community_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS graph_communities_unique_idx ON graph_communities (run_id, algorithm, community_id);
CREATE INDEX IF NOT EXISTS graph_communities_algorithm_idx ON graph_communities (algorithm);
