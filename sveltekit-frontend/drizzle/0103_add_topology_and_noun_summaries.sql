-- Migration: Add topology, provenance, and noun summary fields to code_features
-- Date: July 2, 2026
-- Purpose: Enable graph-aware ranking and noun-based reranking before Gemma4 synthesis
--
-- Three-summary schema:
-- 1. summary (existing) — Gemma4 human-readable explanation
-- 2. topology_summary (new) — SOM/graph/cluster position for ranking
-- 3. provenance_summary (new) — Hash/tuple/source_ref lineage for audit
-- 4. noun_terms (new) — Extracted nouns/env keys/symbols for lexical reranking
--
-- Ranking formula (Phase 102 noun reranker):
-- score = 0.22·semantic + 0.18·lexical + 0.15·noun_overlap
--       + 0.15·page_rank + 0.12·topology + 0.10·path_match + 0.08·freshness

BEGIN;

-- Add topology_summary (graph position: SOM cell, cluster, neighbors)
ALTER TABLE code_features
ADD COLUMN IF NOT EXISTS topology_summary TEXT DEFAULT NULL;

COMMENT ON COLUMN code_features.topology_summary IS
'SOM/graph/cluster position. Example: "Feature sits in vector retrieval cluster with Qdrant, TurboVec neighbors."
Used for ranking, peer discovery, multi-hop traversal. Not user-facing.';

-- Add provenance_summary (source_ref, hash, tuple lineage)
ALTER TABLE code_features
ADD COLUMN IF NOT EXISTS provenance_summary TEXT DEFAULT NULL;

COMMENT ON COLUMN code_features.provenance_summary IS
'Derived from source_ref paths, tuple hashes, shared tags, code_feature_edges.
Used for audit trail and reranker trace. Not user-facing.';

-- Add noun_terms (extracted nouns/env keys/symbols for reranking)
ALTER TABLE code_features
ADD COLUMN IF NOT EXISTS noun_terms JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN code_features.noun_terms IS
'Extracted nouns, env keys, symbols for lexical/noun reranking.
Example: ["DATABASEURL", "REDISURL", "QDRANTURL", "OLLAMAURL", "PUBLICAPPURL"]
Populated by noun extraction pass; used in ranking before Gemma4.
Weight in formula: 0.15 (15% of final score).';

-- Add som_cell (SOM grid position for topology smoothing)
ALTER TABLE code_features
ADD COLUMN IF NOT EXISTS som_cell VARCHAR(10) DEFAULT NULL;

COMMENT ON COLUMN code_features.som_cell IS
'Self-Organizing Map grid position. Example: "12,7"
Used for tricubic topology smoothing and neighbor discovery.';

-- Add page_rank_score (Authority score from Neo4j PageRank)
ALTER TABLE code_features
ADD COLUMN IF NOT EXISTS page_rank_score REAL DEFAULT 0.0;

CREATE INDEX IF NOT EXISTS idx_code_features_page_rank_score
ON code_features (page_rank_score DESC);

COMMENT ON COLUMN code_features.page_rank_score IS
'PageRank authority score from Neo4j (0.0-1.0 range).
Weight in formula: 0.15 (15% of final score).';

-- Add topology_weight (confidence in topology position)
ALTER TABLE code_features
ADD COLUMN IF NOT EXISTS topology_weight REAL DEFAULT 0.5;

COMMENT ON COLUMN code_features.topology_weight IS
'Confidence in topology_summary position (0.0-1.0).
Low weight = uncertain position (new feature).
Used in tricubic SOM interpolation.';

-- Verify migration
DO $$
DECLARE
  cols_added INT := 0;
BEGIN
  SELECT COUNT(*) INTO cols_added FROM information_schema.columns
  WHERE table_name = 'code_features'
  AND column_name IN ('topology_summary', 'provenance_summary', 'noun_terms', 'som_cell', 'page_rank_score', 'topology_weight');

  IF cols_added = 6 THEN
    RAISE NOTICE 'Migration successful: % columns added to code_features', cols_added;
  ELSE
    RAISE WARNING 'Migration incomplete: expected 6 columns, found %', cols_added;
  END IF;
END $$;

COMMIT;
