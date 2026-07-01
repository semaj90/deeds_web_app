-- Migration: Restore weight column to code_feature_edges
-- Date: July 1, 2026
-- Purpose: Enable asymmetric edge weighting for PageRank and 6-signal blend ranking
--
-- Weight is used in:
-- 1. trace-mcp-server.ts (SHARES_TAGS peer discovery)
-- 2. Admin search API (6-signal blend reranking)
-- 3. PageRank computation (edge weight input)
--
-- Note: confidence column remains for reliability scoring

BEGIN;

-- Add weight column if it doesn't exist
ALTER TABLE IF EXISTS code_feature_edges
ADD COLUMN IF NOT EXISTS weight REAL DEFAULT 1.0;

-- Backfill from confidence (most edges will use this)
-- For edges with no confidence, use 1.0 (neutral weight)
UPDATE code_feature_edges
SET weight = COALESCE(confidence, 1.0)
WHERE weight IS NULL OR weight = 0;

-- Add comment for clarity
COMMENT ON COLUMN code_feature_edges.weight IS
'Edge weight for ranking and traversal; distinct from confidence (reliability score).
Used in PageRank computation, 6-signal blend reranking, and graph traversal.
Range: 0.1-2.0 (recommended). Default: 1.0 (neutral).';

-- Verify migration
DO $$
DECLARE
  total_edges INT;
  weighted_edges INT;
BEGIN
  SELECT COUNT(*) INTO total_edges FROM code_feature_edges;
  SELECT COUNT(*) INTO weighted_edges FROM code_feature_edges WHERE weight IS NOT NULL;

  IF total_edges > 0 THEN
    RAISE NOTICE 'Migration successful: % of % edges now have weight values',
      weighted_edges, total_edges;
  ELSE
    RAISE NOTICE 'No edges found in code_feature_edges (table may be empty)';
  END IF;
END $$;

COMMIT;
