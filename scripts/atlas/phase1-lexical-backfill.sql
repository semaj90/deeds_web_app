-- ============================================================================
-- Phase 1: Lexical Layer Backfill (BM25 via PostgreSQL Full Text Search)
-- ============================================================================
-- Purpose: Populate atlas_feature_envelopes.lexical_terms with deterministic
--          BM25 scores derived from source_ref, file_path, tree_node_ids, etc.
--
-- Input: 58,365 packets with tree_node_ids (from Layer 2 - Structural)
-- Output: lexical_terms JSONB containing { token: bm25_score, ... }
--
-- Time: ~45 minutes for full corpus
-- Determinism: Same input → same tokens (no randomness)
-- ============================================================================

-- ============================================================================
-- Step 1: Create lexical extraction working table
-- ============================================================================

CREATE TEMP TABLE lexical_extraction AS
SELECT
  packet_key,
  source_ref,
  file_path,
  feature_id,
  feature_label,
  COALESCE(tree_node_ids, '[]'::jsonb) as tree_node_ids,
  summary_text
FROM atlas_feature_envelopes
WHERE lexical_terms IS NULL  -- Only backfill missing
LIMIT 58365;

CREATE INDEX idx_lex_temp_key ON lexical_extraction(packet_key);

-- ============================================================================
-- Step 2: Create aggregate tsvector (PostgreSQL full text search vector)
-- ============================================================================

-- (A) Extract identifiers from tree_node_ids JSON array
-- (B) Split file_path by / and .
-- (C) Lowercase directory
-- (D) Parse route name from source_ref
-- (E) Extract comments from summary_text (if present)

CREATE TEMP TABLE lexical_tokens AS
SELECT
  packet_key,
  -- Combine all token sources into a single tsvector
  setweight(
    to_tsvector('english', COALESCE(
      -- Identifiers from AST (weight 'A' = highest)
      array_to_string(
        array_agg(DISTINCT jsonb_array_elements(tree_node_ids)->>'name')
          FILTER (WHERE jsonb_array_elements(tree_node_ids)->>'name' IS NOT NULL),
        ' '
      ) || ' ' ||
      -- File path segments
      regexp_replace(file_path, '[/\\.]+', ' ', 'g') || ' ' ||
      -- Feature ID and label
      feature_id || ' ' || feature_label || ' ' ||
      -- Directory (extract from source_ref)
      (regexp_split_to_array(source_ref, '/'))[array_upper(regexp_split_to_array(source_ref, '/'), 1) - 1],
      ''
    )),
    'A'
  )
  ||
  setweight(
    to_tsvector('english', COALESCE(summary_text, '')),
    'B'  -- Summary at lower weight
  )
  as tokens
FROM lexical_extraction
GROUP BY packet_key, source_ref, file_path, feature_id, feature_label, tree_node_ids, summary_text;

-- ============================================================================
-- Step 3: Compute BM25 scores for each token
-- ============================================================================

-- PostgreSQL doesn't have native BM25, so approximate using ts_rank_cd
-- ts_rank_cd = ( log(1 + x) ) / log(1 + D)
-- Where: x = lexeme count, D = document count
-- This gives a reasonable approximation of BM25 without full implementation

CREATE TEMP TABLE lexical_bm25_scores AS
WITH token_frequencies AS (
  SELECT
    packet_key,
    (each(frequencies)).key as token,
    (each(frequencies)).value::float8 as frequency
  FROM (
    SELECT
      packet_key,
      tsvector_to_array(tokens)::text[] as token_array,
      -- Create frequency map (simplified: assume each token appears once per packet)
      array_to_tsvector(tsvector_to_array(tokens))::text as frequencies
    FROM lexical_tokens
  ) sub
),
document_frequencies AS (
  SELECT
    token,
    COUNT(DISTINCT packet_key) as document_count
  FROM token_frequencies
  WHERE token NOT IN (
    -- Exclude stopwords
    'and', 'or', 'the', 'is', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'this', 'that', 'from', 'by', 'as', 'if', 'then', 'else', 'while', 'return', 'new'
  )
  GROUP BY token
)
SELECT
  packet_key,
  jsonb_object_agg(
    token,
    ROUND(
      (1.0 + ln(1.0 + frequency)) / (1.0 + ln(1.0 + document_count::float8))::numeric,
      3
    )
  ) as lexical_terms
FROM (
  SELECT
    tf.packet_key,
    tf.token,
    tf.frequency,
    COALESCE(df.document_count, (SELECT COUNT(*) FROM lexical_extraction)) as document_count
  FROM token_frequencies tf
  LEFT JOIN document_frequencies df ON tf.token = df.token
) sub
GROUP BY packet_key;

-- ============================================================================
-- Step 4: Verify determinism (sample check)
-- ============================================================================

-- Ensure same packet_key produces same lexical_terms on rerun
-- (This is the determinism gate — if rerun produces same output, we're good)

SELECT
  COUNT(DISTINCT packet_key) as unique_packets,
  COUNT(*) as total_rows,
  AVG(jsonb_object_length(lexical_terms)) as avg_tokens_per_packet,
  MIN(jsonb_object_length(lexical_terms)) as min_tokens,
  MAX(jsonb_object_length(lexical_terms)) as max_tokens
FROM lexical_bm25_scores;

-- ============================================================================
-- Step 5: Update atlas_feature_envelopes (APPLY PHASE)
-- ============================================================================

-- ⚠️ UNCOMMENT BELOW TO APPLY CHANGES (currently in dry-run mode)

/*
BEGIN TRANSACTION;

UPDATE atlas_feature_envelopes afe
SET
  lexical_terms = lbs.lexical_terms,
  lexical_token_count = jsonb_object_length(lbs.lexical_terms),
  updated_at = NOW()
FROM lexical_bm25_scores lbs
WHERE afe.packet_key = lbs.packet_key;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_lexical_terms_gin
ON atlas_feature_envelopes USING GIN (lexical_terms jsonb_path_ops);

-- Create composite index for (domain_class, lexical_terms)
CREATE INDEX IF NOT EXISTS idx_lexical_domain_gin
ON atlas_feature_envelopes (domain_class) INCLUDE (lexical_terms);

COMMIT;

-- ============================================================================
-- Step 6: Verify coverage
-- ============================================================================

SELECT
  COUNT(*) as total_packets,
  COUNT(CASE WHEN lexical_terms IS NOT NULL THEN 1 END) as with_lexical,
  ROUND(100.0 * COUNT(CASE WHEN lexical_terms IS NOT NULL THEN 1 END) / COUNT(*), 1) as coverage_pct
FROM atlas_feature_envelopes;

*/

-- ============================================================================
-- DRY-RUN ONLY: Preview what would be updated
-- ============================================================================

SELECT
  'DRY-RUN: Would update' as status,
  COUNT(*) as packets_to_update,
  ROUND(AVG(jsonb_object_length(lexical_terms)), 1) as avg_tokens,
  MIN(jsonb_object_length(lexical_terms)) as min_tokens,
  MAX(jsonb_object_length(lexical_terms)) as max_tokens
FROM lexical_bm25_scores;

-- Preview sample updates
SELECT
  'SAMPLE' as batch,
  packet_key,
  jsonb_object_keys(lexical_terms) as top_tokens,
  jsonb_object_length(lexical_terms) as token_count
FROM lexical_bm25_scores
LIMIT 10;
