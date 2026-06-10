ALTER TABLE agent_memory_observations
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS agent_memory_observations_embedding_hnsw
  ON agent_memory_observations
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
