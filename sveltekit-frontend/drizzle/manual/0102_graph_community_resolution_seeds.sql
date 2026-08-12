-- Graph community unresolved seed ledger.
-- Durable audit surface for Louvain/Leiden rows that could not be resolved
-- to a canonical atlas_packets.packet_key during the live graph analysis run.

CREATE TABLE IF NOT EXISTS graph_community_resolution_seeds (
  run_id uuid NOT NULL REFERENCES graph_analysis_runs(run_id) ON DELETE CASCADE,
  algorithm text NOT NULL,
  graph_node_key text NOT NULL,
  raw_path text NOT NULL,
  normalized_path text NOT NULL,
  community_id text NOT NULL,
  graph_revision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, graph_node_key)
);

CREATE INDEX IF NOT EXISTS graph_community_resolution_seeds_run_idx
  ON graph_community_resolution_seeds (run_id, algorithm, graph_revision);

CREATE INDEX IF NOT EXISTS graph_community_resolution_seeds_graph_node_idx
  ON graph_community_resolution_seeds (graph_node_key);
