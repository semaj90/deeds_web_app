-- 20260507_hypergraph_members.sql
-- Create hypergraph_edges (with rich metadata) + hypergraph_edge_members junction table

CREATE TABLE IF NOT EXISTS hypergraph_edges (
  id            uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edge_hash     varchar(64) NOT NULL,
  edge_id       text,
  edge_type     text    NOT NULL DEFAULT 'generic',
  member_ids    text[]  NOT NULL DEFAULT '{}',
  title         text,
  summary       text,
  grade_label   varchar(4) NOT NULL DEFAULT 'D',
  grade_score   real    NOT NULL DEFAULT 0,
  confidence    real    NOT NULL DEFAULT 0.5,
  source        text,
  gpu_cluster   integer,
  community_id  integer,
  topo_class    text,
  som_cluster   integer,
  glyph_cluster text,
  som_cell      text,
  manifold4     real[],
  metadata      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hypergraph_edges_edge_hash_uq UNIQUE (edge_hash)
);

CREATE INDEX IF NOT EXISTS hypergraph_edges_grade_idx         ON hypergraph_edges (grade_label);
CREATE INDEX IF NOT EXISTS hypergraph_edges_cluster_idx       ON hypergraph_edges (gpu_cluster);
CREATE INDEX IF NOT EXISTS hypergraph_edges_edge_type_idx     ON hypergraph_edges (edge_type);
CREATE INDEX IF NOT EXISTS hypergraph_edges_topo_class_idx    ON hypergraph_edges (topo_class);
CREATE INDEX IF NOT EXISTS hypergraph_edges_som_cluster_idx   ON hypergraph_edges (som_cluster);
CREATE INDEX IF NOT EXISTS hypergraph_edges_glyph_cluster_idx ON hypergraph_edges (glyph_cluster);

-- Add new columns to pre-existing table if it was already created without them
ALTER TABLE hypergraph_edges
  ADD COLUMN IF NOT EXISTS edge_id       text,
  ADD COLUMN IF NOT EXISTS edge_type     text NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS title         text,
  ADD COLUMN IF NOT EXISTS summary       text,
  ADD COLUMN IF NOT EXISTS confidence    real NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS source        text,
  ADD COLUMN IF NOT EXISTS topo_class    text,
  ADD COLUMN IF NOT EXISTS som_cluster   integer,
  ADD COLUMN IF NOT EXISTS glyph_cluster text,
  ADD COLUMN IF NOT EXISTS som_cell      text,
  ADD COLUMN IF NOT EXISTS manifold4     real[];

CREATE TABLE IF NOT EXISTS hypergraph_edge_members (
  edge_hash   text NOT NULL,
  stable_key  text NOT NULL,
  member_type text NOT NULL DEFAULT 'chunk',
  role        text NOT NULL DEFAULT 'member',
  weight      real NOT NULL DEFAULT 1.0,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (edge_hash, stable_key, role)
);

CREATE INDEX IF NOT EXISTS hem_edge_hash_idx   ON hypergraph_edge_members (edge_hash);
CREATE INDEX IF NOT EXISTS hem_stable_key_idx  ON hypergraph_edge_members (stable_key);
CREATE INDEX IF NOT EXISTS hem_member_type_idx ON hypergraph_edge_members (member_type);
