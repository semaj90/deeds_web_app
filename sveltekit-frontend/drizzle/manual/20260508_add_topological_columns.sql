-- Add missing topological columns to codebase_chunk_index
-- To support audit-parity and 4D manifold retrieval

ALTER TABLE codebase_chunk_index 
ADD COLUMN IF NOT EXISTS chunk_id TEXT,
ADD COLUMN IF NOT EXISTS som_bmu_row INTEGER,
ADD COLUMN IF NOT EXISTS som_bmu_col INTEGER,
ADD COLUMN IF NOT EXISTS manifold4 REAL[];

-- Index chunk_id for direct lookups via the identity spine
CREATE INDEX IF NOT EXISTS codebase_chunk_index_chunk_id_idx ON codebase_chunk_index (chunk_id);
-- Index som_bmu for faster coordinate lookups
CREATE INDEX IF NOT EXISTS codebase_chunk_index_som_bmu_idx ON codebase_chunk_index (som_bmu_row, som_bmu_col);
