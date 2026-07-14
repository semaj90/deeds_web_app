-- Step 1: Add PostgreSQL tsvector column for canonical BM25 search
-- Uses trigger-maintained column (maintains on INSERT/UPDATE)
-- Weighted field tokenization: relative_path (A), symbol (A), summary (B), content (C), semantic_tags (B)
-- This enables ts_rank / websearch_to_tsquery ranking
-- Fallback: trigram (ILIKE) remains as explicit fallback, not primary BM25

-- 1. Add the search_vector column (regular column, not generated)
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Create function to compute tsvector
CREATE OR REPLACE FUNCTION compute_codebase_chunk_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.relative_path, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.symbol, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(COALESCE(NEW.semantic_tags, ARRAY[]::text[]), ' ')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Create trigger to maintain search_vector on INSERT/UPDATE
DROP TRIGGER IF EXISTS trig_update_codebase_chunk_search_vector ON codebase_chunk_index CASCADE;

CREATE TRIGGER trig_update_codebase_chunk_search_vector
BEFORE INSERT OR UPDATE ON codebase_chunk_index
FOR EACH ROW
EXECUTE FUNCTION compute_codebase_chunk_search_vector();

-- 4. Backfill existing rows
UPDATE codebase_chunk_index
SET search_vector =
  setweight(to_tsvector('english', COALESCE(relative_path, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(symbol, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(summary, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C') ||
  setweight(to_tsvector('english', array_to_string(COALESCE(semantic_tags, ARRAY[]::text[]), ' ')), 'B')
WHERE search_vector IS NULL;

-- 5. Create GIN index for fast ts_rank queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_bm25_search
ON codebase_chunk_index
USING GIN (search_vector);

-- Verify the index was created
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname = 'idx_codebase_chunk_bm25_search';
