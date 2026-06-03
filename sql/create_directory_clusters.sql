CREATE TABLE IF NOT EXISTS directory_cluster_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_key TEXT NOT NULL UNIQUE,
  directory_path TEXT NOT NULL,
  checkpoint_hash TEXT NOT NULL,
  file_count INT NOT NULL DEFAULT 0,
  route_count INT NOT NULL DEFAULT 0,
  test_count INT NOT NULL DEFAULT 0,
  cluster_label TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  audit JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  indexed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dir_cluster_path_idx ON directory_cluster_checkpoints(directory_path);
