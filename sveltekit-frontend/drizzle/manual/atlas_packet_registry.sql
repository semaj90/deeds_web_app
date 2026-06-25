-- Canonical Packet Registry
-- Single source of truth for all packet state across the system
-- Every service reads/writes via this table; mirrors live in Qdrant, Valkey, Neo4j, DuckDB

CREATE TABLE IF NOT EXISTS atlas_packet_registry (
  -- Identity (immutable spine)
  packet_key                TEXT PRIMARY KEY,
  trace_id                  TEXT,
  source_ref                TEXT NOT NULL,
  file_path                 TEXT NOT NULL,
  feature_id                TEXT NOT NULL,

  -- Content
  title                     TEXT,
  summary                   TEXT,

  -- Embedding & Latent State
  embedding_status          TEXT DEFAULT 'missing' CHECK (embedding_status IN ('missing', 'pending', 'complete', 'failed')),
  embedding_dim             INT DEFAULT 768,
  embedding_768d            vector(768),
  latent_384d               vector(384),
  latent_64                 bytea,  -- Compressed 64-dim latent vector (from autoencoder)

  -- Clustering & Manifold Geometry
  kmeans_cluster_id         TEXT,
  som_x                     INT,
  som_y                     INT,
  semantic_z                REAL,    -- 3rd-dim semantic coordinate (for 3D visualizations)
  activity_w                REAL,    -- 4th-dim activity coordinate (engagement/retrieval metric)
  manifold4                 JSONB,   -- Full 4D manifold projection {x, y, z, w} + metadata

  -- Service References (Canonical → Mirror Mapping)
  qdrant_point_id           BIGINT UNIQUE,
  turbovec_id               TEXT UNIQUE,     -- TurboVec sparse index ID
  neo4j_node_id             TEXT UNIQUE,
  valkey_cache_key          TEXT UNIQUE,     -- e.g., "bifrost:packet:auth:001"
  ace_cache_key             TEXT UNIQUE,     -- ACE context cache key
  seaweedfs_filer_path      TEXT UNIQUE,     -- Raw document path in SeaweedFS

  -- Authority & Ranking
  pagerank_score            REAL,
  authority_blend           REAL,    -- 0.4·pagerank + 0.3·attention + 0.3·authority
  karpathy_score            REAL,    -- GPU attention blend score
  last_rerank_score         REAL,    -- Most recent reranking score

  -- Retrieval Metrics
  retrieval_count           INT DEFAULT 0,
  cache_hits                INT DEFAULT 0,
  cache_misses              INT DEFAULT 0,
  last_retrieved            TIMESTAMP,

  -- Cache State & Lifecycle
  cache_state               TEXT DEFAULT 'cold' CHECK (cache_state IN ('L1:redis', 'L2:bifrost', 'L3:qdrant', 'L4:disk', 'cold')),
  activity                  JSONB,   -- {indexed_at, embedded_at, cached_at, retrieved_at, reranked_at, etc}
  status                    TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'staged', 'error')),

  -- Timestamps
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),

  -- Relationships (for KAG/DAG retrieval)
  kag_edges                 JSONB DEFAULT '{}'::jsonb,    -- {feature_id → [feature_ids]} (Knowledge-Augmented Graph)
  dag_edges                 JSONB DEFAULT '{}'::jsonb,    -- {packet_key → [packet_keys]} (Dependency DAG)

  -- Operational Metadata
  total_size_bytes          BIGINT,  -- Total size of packet across all stores
  validation_status         TEXT CHECK (validation_status IN ('valid', 'needs_review', 'corrupted')),
  last_validated            TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_packet_feature_id ON atlas_packet_registry(feature_id);
CREATE INDEX IF NOT EXISTS idx_packet_cache_state ON atlas_packet_registry(cache_state);
CREATE INDEX IF NOT EXISTS idx_packet_pagerank ON atlas_packet_registry(pagerank_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_packet_authority ON atlas_packet_registry(authority_blend DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_packet_retrieved ON atlas_packet_registry(last_retrieved DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_packet_updated ON atlas_packet_registry(updated_at DESC);

-- Vector index for semantic search (if using pgvector similarity)
CREATE INDEX IF NOT EXISTS idx_packet_embedding_cosine ON atlas_packet_registry USING hnsw (embedding_768d vector_cosine_ops);

-- JSONB indexes for relationship queries
CREATE INDEX IF NOT EXISTS idx_packet_kag_edges ON atlas_packet_registry USING gin(kag_edges);
CREATE INDEX IF NOT EXISTS idx_packet_dag_edges ON atlas_packet_registry USING gin(dag_edges);

-- Materialized view for cache state audit
CREATE OR REPLACE VIEW v_packet_cache_audit AS
SELECT
  packet_key,
  feature_id,
  cache_state,
  CASE
    WHEN cache_state = 'L1:redis' THEN 1
    WHEN cache_state = 'L2:bifrost' THEN 2
    WHEN cache_state = 'L3:qdrant' THEN 3
    WHEN cache_state = 'L4:disk' THEN 4
    ELSE 5
  END AS cache_tier,
  retrieval_count,
  cache_hits,
  CASE
    WHEN retrieval_count > 0 THEN ROUND(100.0 * cache_hits / retrieval_count, 2)
    ELSE 0
  END AS hit_rate_pct,
  last_retrieved,
  updated_at
FROM atlas_packet_registry
WHERE status = 'active'
ORDER BY cache_tier, retrieval_count DESC;

-- Materialized view for packet health audit
CREATE OR REPLACE VIEW v_packet_health_audit AS
SELECT
  packet_key,
  feature_id,
  embedding_status,
  CASE
    WHEN embedding_status = 'complete' AND qdrant_point_id IS NOT NULL AND neo4j_node_id IS NOT NULL THEN 'HEALTHY'
    WHEN embedding_status IN ('missing', 'failed') THEN 'ERROR'
    WHEN qdrant_point_id IS NULL OR neo4j_node_id IS NULL THEN 'INCOMPLETE'
    ELSE 'WARNING'
  END AS health_status,
  COALESCE(qdrant_point_id::text, 'missing') AS qdrant_linked,
  COALESCE(neo4j_node_id, 'missing') AS neo4j_linked,
  COALESCE(valkey_cache_key, 'not_cached') AS cache_status,
  pagerank_score,
  authority_blend,
  created_at,
  updated_at
FROM atlas_packet_registry
WHERE status = 'active'
ORDER BY health_status, updated_at DESC;
