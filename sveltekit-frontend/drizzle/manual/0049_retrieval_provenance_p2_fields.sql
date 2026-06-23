-- P1h Provenance Breadth Phase 2 fields
-- Add retrieval_strategy and retrieval_path to support P2 enrichment

ALTER TABLE retrieval_provenance
ADD COLUMN IF NOT EXISTS retrieval_strategy varchar(100),
ADD COLUMN IF NOT EXISTS retrieval_path text;

-- Index for retrieval_strategy queries
CREATE INDEX IF NOT EXISTS idx_rp_retrieval_strategy ON retrieval_provenance (retrieval_strategy);

-- Index for retrieval_path prefix searches
CREATE INDEX IF NOT EXISTS idx_rp_retrieval_path ON retrieval_provenance USING btree (retrieval_path);
