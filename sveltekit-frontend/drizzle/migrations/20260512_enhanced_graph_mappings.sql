-- Persisted feature map / GraphRAG mapping store.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS enhanced_graph_mappings (
  id text PRIMARY KEY,
  kind text NOT NULL,
  label text NOT NULL,
  path text,
  summary text,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  flags integer NOT NULL DEFAULT 0,
  vectors jsonb NOT NULL DEFAULT '{}'::jsonb,
  manifold4 real[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enhanced_graph_mappings_kind_idx ON enhanced_graph_mappings(kind);
CREATE INDEX IF NOT EXISTS enhanced_graph_mappings_path_idx ON enhanced_graph_mappings(path);
CREATE INDEX IF NOT EXISTS enhanced_graph_mappings_updated_at_idx ON enhanced_graph_mappings(updated_at DESC);
