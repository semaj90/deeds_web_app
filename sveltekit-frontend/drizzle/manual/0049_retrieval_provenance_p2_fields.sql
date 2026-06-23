-- P1h/P2 Provenance Breadth fields
-- Add retrieval_strategy and retrieval_path to support replay provenance
-- retrieval_path is JSONB to preserve replayable structure (same as traversal_path)

ALTER TABLE retrieval_provenance
ADD COLUMN IF NOT EXISTS retrieval_strategy text,
ADD COLUMN IF NOT EXISTS retrieval_path jsonb DEFAULT '[]'::jsonb;

-- Index for retrieval_strategy queries
CREATE INDEX IF NOT EXISTS idx_rp_retrieval_strategy
ON retrieval_provenance (retrieval_strategy);

-- GIN index for retrieval_path array contains queries
CREATE INDEX IF NOT EXISTS idx_rp_retrieval_path_gin
ON retrieval_provenance USING gin (retrieval_path);
