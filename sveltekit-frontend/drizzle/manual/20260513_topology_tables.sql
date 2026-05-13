-- 20260513_topology_tables.sql
-- Creates topology_snapshots and topology_positions tables

CREATE TABLE IF NOT EXISTS topology_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  git_commit text,
  repo_root text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS topology_positions (
  snapshot_id uuid NOT NULL REFERENCES topology_snapshots(id) ON DELETE CASCADE,
  stable_key text NOT NULL,
  x double precision,
  y double precision,
  z double precision,
  t double precision,
  cluster_key text,
  topo_byte smallint,
  source_kind text,
  source_hash text,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (snapshot_id, stable_key)
);

CREATE INDEX IF NOT EXISTS topology_positions_topo_byte_idx ON topology_positions(topo_byte);
