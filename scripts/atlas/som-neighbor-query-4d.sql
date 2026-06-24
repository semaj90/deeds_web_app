-- SOM Neighbor Query Pattern — 4D Topology Retrieval
--
-- Queries the 2D SOM grid (som_row, som_col) to find neighbors for ACE Stage A0 pre-filter.
-- Combines spatial locality (SOM grid) + semantic similarity (embedding) + feature overlap + lineage.
--
-- Execution flow:
--   1. Index scan on (som_row, som_col) to find grid neighbors
--   2. Pack embeddings into Float32Array for RTX batchCosineSimilarity
--   3. Rerank by feature overlap + community + pagerank
--   4. Filter by packet lineage (superseded chain)
--
-- 4D topology axes:
--   x (col) = SOM horizontal
--   y (row) = SOM vertical
--   z       = latent_64 manifold / cluster_id hierarchy
--   t       = packet_key lineage / created_at recency

-- Pattern 1: Exact SOM neighbor neighborhood (8-neighbors, Moore distance)
-- Used by: ACE Stage A0 topology prefilter (Bifrost pre-candidate narrowing)
SELECT
  p.packet_id,
  p.packet_key,
  p.source_ref,
  p.feature_id,
  p.som_index,
  p.som_row,
  p.som_col,
  p.embedding,
  p.cluster_id,
  p.community_id,
  p.pagerank,
  ABS(p.som_row - $1) + ABS(p.som_col - $2) as moore_distance,
  CASE
    WHEN p.feature_id = $3 THEN 2.0
    WHEN p.community_id = (SELECT community_id FROM atlas_packets WHERE packet_key = $4) THEN 1.5
    ELSE 1.0
  END as feature_boost,
  p.created_at,
  p.canonical
FROM atlas_packets p
WHERE p.som_row BETWEEN $1 - 1 AND $1 + 1
  AND p.som_col BETWEEN $2 - 1 AND $2 + 1
  AND p.som_index IS NOT NULL
  AND p.embedding IS NOT NULL
ORDER BY moore_distance, p.pagerank DESC, p.created_at DESC
LIMIT $5;

-- Pattern 2: Feature-scoped SOM neighborhood (better for ontology-aware retrieval)
-- Used by: KAG feature enrichment stage
SELECT
  p.packet_id,
  p.packet_key,
  p.source_ref,
  p.feature_id,
  p.som_index,
  p.embedding,
  p.community_id,
  p.pagerank,
  ABS(p.som_row - $1) + ABS(p.som_col - $2) as moore_distance
FROM atlas_packets p
WHERE p.som_row BETWEEN $1 - 1 AND $1 + 1
  AND p.som_col BETWEEN $2 - 1 AND $2 + 1
  AND p.feature_id = $3  -- Feature constraint: ontology axis
  AND p.som_index IS NOT NULL
  AND p.embedding IS NOT NULL
ORDER BY moore_distance, p.pagerank DESC
LIMIT $4;

-- Pattern 3: Latent manifold neighborhood (4D with learned compression)
-- Used by: GPU reranking post-processing (latent_64 semantic similarity)
SELECT
  p.packet_id,
  p.packet_key,
  p.source_ref,
  p.feature_id,
  p.som_index,
  p.som_row,
  p.som_col,
  p.embedding,
  p.latent_64,  -- Compressed 64-dim manifold for GPU clustering
  p.cluster_id,
  p.pagerank,
  ABS(p.som_row - $1) + ABS(p.som_col - $2) as moore_distance,
  p.created_at
FROM atlas_packets p
WHERE p.som_row BETWEEN $1 - 1 AND $1 + 1
  AND p.som_col BETWEEN $2 - 1 AND $2 + 1
  AND p.som_index IS NOT NULL
  AND p.embedding IS NOT NULL
  AND p.latent_64 IS NOT NULL
ORDER BY moore_distance, p.pagerank DESC, p.created_at DESC
LIMIT $4;

-- Pattern 4: Lineage-aware neighbor query (4D with packet supersession chain)
-- Used by: Proof/audit lane (verify packet provenance and superseded chains)
--
-- A packet can be superseded by newer versions. This query traces the chain:
--   packet_key → supersedes → superseded_by → ...
--
-- For retrieval: include superseding packets (newer) but filter out superseded (old).
WITH RECURSIVE packet_lineage AS (
  -- Start with the current packet
  SELECT
    p.packet_id,
    p.packet_key,
    p.source_ref,
    p.som_row,
    p.som_col,
    p.feature_id,
    p.created_at,
    p.canonical,
    0 as depth,
    ARRAY[p.packet_key] as path
  FROM atlas_packets p
  WHERE p.packet_key = $1

  UNION ALL

  -- Recursively find superseding packets (newer versions)
  SELECT
    p.packet_id,
    p.packet_key,
    p.source_ref,
    p.som_row,
    p.som_col,
    p.feature_id,
    p.created_at,
    p.canonical,
    pl.depth + 1,
    pl.path || p.packet_key
  FROM atlas_packets p
  JOIN packet_lineage pl ON p.payload->>'supersedes' = pl.packet_key
  WHERE pl.depth < 5  -- Limit recursion depth
)
SELECT
  pl.packet_id,
  pl.packet_key,
  pl.source_ref,
  pl.feature_id,
  pl.som_row,
  pl.som_col,
  pl.created_at,
  pl.canonical,
  pl.depth,
  pl.path
FROM packet_lineage pl
ORDER BY pl.created_at DESC, pl.depth;

-- Pattern 5: 4D topology matrix query (for authority/PageRank blend)
-- Combines all four dimensions into a single ranking score for ACE context assembly
--
-- Score = w1 * som_proximity + w2 * semantic_sim + w3 * pagerank + w4 * feature_match
--
-- For RTX matrix compute:
--   1. Postgres filters by SOM grid (indexes used)
--   2. Fetch embeddings into Float32Array
--   3. RTX computes batchCosineSimilarity (w2 term)
--   4. Postgres reranks by pagerank + feature_match (w3, w4)
--
SELECT
  p.packet_id,
  p.packet_key,
  p.source_ref,
  p.feature_id,
  p.som_index,
  p.som_row,
  p.som_col,
  p.embedding,
  p.latent_64,
  p.pagerank,
  p.betweenness,
  p.community_id,
  p.cluster_id,
  -- 4D Blending formula (weights configurable via ACE blend params)
  (
    0.20 * (1.0 / (1.0 + ABS(p.som_row - $1) + ABS(p.som_col - $2)))  -- w1: SOM proximity
    + 0.35 * COALESCE(p.pagerank, 0.5)  -- w3: PageRank authority
    + 0.25 * CASE WHEN p.feature_id = $3 THEN 1.0 ELSE 0.5 END  -- w4: Feature match
    + 0.20 * COALESCE(p.betweenness, 0.0)  -- Betweenness for community bridges
  ) as topology_score
FROM atlas_packets p
WHERE p.som_row BETWEEN $1 - 1 AND $1 + 1
  AND p.som_col BETWEEN $2 - 1 AND $2 + 1
  AND p.som_index IS NOT NULL
  AND p.embedding IS NOT NULL
ORDER BY topology_score DESC, p.pagerank DESC
LIMIT $4;
