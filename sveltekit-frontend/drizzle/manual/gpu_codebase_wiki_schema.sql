-- GPU-Accelerated Codebase Wiki Schema
-- MapReduce CUDA analysis with cosine retrieval semantics
-- Created: April 9, 2026

-- ═══════════════════════════════════════════════════════════════════
-- Core Tables
-- ═══════════════════════════════════════════════════════════════════

-- Codebase files indexed with GPU-accelerated embeddings
CREATE TABLE IF NOT EXISTS codebase_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL UNIQUE,
  file_hash VARCHAR(64) NOT NULL,           -- SHA-256 for cache invalidation
  language VARCHAR(50) NOT NULL,             -- ts, svelte, py, go, etc.
  lines_of_code INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  domain VARCHAR(100),                       -- auth, rag, evidence, ui, etc.
  importance_score REAL DEFAULT 0.0,         -- PageRank score from Neo4j
  community_id INTEGER,                      -- Louvain community from graph
  indexed_at TIMESTAMP DEFAULT NOW(),
  last_modified TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- GPU-accelerated embedding vectors (768-dim)
CREATE TABLE IF NOT EXISTS codebase_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES codebase_files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,              -- For multi-chunk files
  chunk_text TEXT NOT NULL,
  embedding vector(768) NOT NULL,            -- pgvector 768-dim
  embedding_model VARCHAR(100) DEFAULT 'embeddinggemma:latest',
  tokens INTEGER,
  gpu_device VARCHAR(50),                    -- RTX 3060 Ti, etc.
  cuda_time_ms REAL,                         -- GPU inference time
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(file_id, chunk_index)
);

-- HNSW index for cosine similarity (halfvec for 50% memory savings)
CREATE INDEX IF NOT EXISTS idx_codebase_embeddings_hnsw
  ON codebase_embeddings
  USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Graph analysis results (from Neo4j + LibTorch)
CREATE TABLE IF NOT EXISTS codebase_graph_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_type VARCHAR(50) NOT NULL,        -- pagerank, louvain, kmeans, duplicates
  run_at TIMESTAMP DEFAULT NOW(),
  config JSONB NOT NULL,                     -- {maxNodes: 500, dupThreshold: 0.92, ...}
  timing JSONB NOT NULL,                     -- {neo4j_ms, libtorch_ms, qdrant_ms, total_ms}
  gpu_info JSONB NOT NULL,                   -- {device, vram_used, cuda_version, ...}
  results JSONB NOT NULL,                    -- Analysis results
  health_score INTEGER                        -- 0-100
);

-- MapReduce job tracking for CUDA batch processing
CREATE TABLE IF NOT EXISTS codebase_mapreduce_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(50) NOT NULL,             -- embed, cluster, similarity, duplicate
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  total_files INTEGER NOT NULL,
  processed_files INTEGER DEFAULT 0,
  batch_size INTEGER NOT NULL,
  concurrency INTEGER NOT NULL,
  gpu_device VARCHAR(50),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  results JSONB,
  metrics JSONB DEFAULT '{}'::jsonb          -- {avg_time_per_file_ms, gpu_util_pct, ...}
);

-- Semantic search cache (GPU-accelerated cosine retrieval)
CREATE TABLE IF NOT EXISTS codebase_search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash VARCHAR(64) NOT NULL UNIQUE,    -- SHA-256 of normalized query
  query_text TEXT NOT NULL,
  query_embedding vector(768) NOT NULL,
  results JSONB NOT NULL,                    -- Top-K results with scores
  result_count INTEGER NOT NULL,
  gpu_time_ms REAL,
  cached_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW(),
  hit_count INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_search_cache_accessed
  ON codebase_search_cache(last_accessed DESC);

-- Wiki pages (auto-generated from codebase analysis)
CREATE TABLE IF NOT EXISTS codebase_wiki_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(200) NOT NULL UNIQUE,         -- file-path-normalized
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,                     -- Markdown content
  related_files UUID[] DEFAULT ARRAY[]::UUID[], -- Foreign keys to codebase_files
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  category VARCHAR(100),                     -- component, service, route, util, etc.
  pagerank_score REAL DEFAULT 0.0,
  view_count INTEGER DEFAULT 0,
  generated_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Full-text search index on wiki pages
CREATE INDEX IF NOT EXISTS idx_wiki_pages_fts
  ON codebase_wiki_pages
  USING GIN (to_tsvector('english', title || ' ' || summary || ' ' || content));

-- ═══════════════════════════════════════════════════════════════════
-- MapReduce Intermediate Tables
-- ═══════════════════════════════════════════════════════════════════

-- Map phase: File chunks awaiting GPU embedding
CREATE TABLE IF NOT EXISTS mapreduce_map_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES codebase_mapreduce_jobs(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',      -- pending, processing, completed, failed
  worker_id VARCHAR(100),                    -- GPU worker ID
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mapreduce_queue_status
  ON mapreduce_map_queue(status, created_at);

-- Reduce phase: Aggregated results
CREATE TABLE IF NOT EXISTS mapreduce_reduce_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES codebase_mapreduce_jobs(id) ON DELETE CASCADE,
  reduce_key VARCHAR(200) NOT NULL,          -- domain, community, file_path, etc.
  aggregation_type VARCHAR(50) NOT NULL,     -- avg_embedding, cluster_centroid, etc.
  result JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- CUDA Performance Metrics
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gpu_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW(),
  gpu_device VARCHAR(50) NOT NULL,
  operation VARCHAR(50) NOT NULL,            -- embed, cosine, kmeans, pagerank
  batch_size INTEGER NOT NULL,
  input_size INTEGER NOT NULL,               -- Vectors, nodes, etc.
  duration_ms REAL NOT NULL,
  vram_used_mb INTEGER,
  gpu_utilization_pct INTEGER,
  temperature_celsius INTEGER,
  fp16_mode BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gpu_metrics_timestamp
  ON gpu_performance_metrics(timestamp DESC);

-- ═══════════════════════════════════════════════════════════════════
-- Views
-- ═══════════════════════════════════════════════════════════════════

-- Top files by importance (PageRank + embedding centrality)
CREATE OR REPLACE VIEW v_codebase_central_files AS
SELECT
  cf.id,
  cf.file_path,
  cf.domain,
  cf.importance_score,
  cf.community_id,
  cf.lines_of_code,
  COUNT(DISTINCT ce.id) as chunk_count,
  cf.metadata
FROM codebase_files cf
LEFT JOIN codebase_embeddings ce ON cf.id = ce.file_id
GROUP BY cf.id
ORDER BY cf.importance_score DESC;

-- Recent MapReduce jobs summary
CREATE OR REPLACE VIEW v_mapreduce_jobs_summary AS
SELECT
  id,
  job_type,
  status,
  processed_files || '/' || total_files as progress,
  ROUND(EXTRACT(EPOCH FROM (completed_at - started_at))::numeric, 2) as duration_seconds,
  (metrics->>'avg_time_per_file_ms')::real as avg_ms_per_file,
  started_at,
  completed_at
FROM codebase_mapreduce_jobs
ORDER BY started_at DESC;

-- GPU performance summary
CREATE OR REPLACE VIEW v_gpu_performance_summary AS
SELECT
  operation,
  COUNT(*) as run_count,
  AVG(duration_ms)::real as avg_duration_ms,
  MIN(duration_ms)::real as min_duration_ms,
  MAX(duration_ms)::real as max_duration_ms,
  AVG(gpu_utilization_pct)::integer as avg_gpu_util,
  AVG(vram_used_mb)::integer as avg_vram_mb
FROM gpu_performance_metrics
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY operation
ORDER BY avg_duration_ms DESC;

-- ═══════════════════════════════════════════════════════════════════
-- Functions
-- ═══════════════════════════════════════════════════════════════════

-- Semantic search with GPU-accelerated cosine similarity
CREATE OR REPLACE FUNCTION codebase_semantic_search(
  query_embedding vector(768),
  limit_count INTEGER DEFAULT 10,
  min_score REAL DEFAULT 0.5,
  domain_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  file_id UUID,
  file_path TEXT,
  chunk_index INTEGER,
  chunk_text TEXT,
  similarity_score REAL,
  domain VARCHAR,
  importance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cf.id,
    cf.file_path,
    ce.chunk_index,
    ce.chunk_text,
    (1 - (ce.embedding <=> query_embedding))::real as similarity_score,
    cf.domain,
    cf.importance_score
  FROM codebase_embeddings ce
  JOIN codebase_files cf ON ce.file_id = cf.id
  WHERE
    (domain_filter IS NULL OR cf.domain = domain_filter)
    AND (1 - (ce.embedding <=> query_embedding)) >= min_score
  ORDER BY ce.embedding <=> query_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Update wiki page view count
CREATE OR REPLACE FUNCTION increment_wiki_view_count(page_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE codebase_wiki_pages
  SET view_count = view_count + 1
  WHERE id = page_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════
-- Indexes for Performance
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_codebase_files_domain ON codebase_files(domain);
CREATE INDEX IF NOT EXISTS idx_codebase_files_importance ON codebase_files(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_codebase_files_community ON codebase_files(community_id);
CREATE INDEX IF NOT EXISTS idx_codebase_embeddings_file ON codebase_embeddings(file_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_category ON codebase_wiki_pages(category);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_pagerank ON codebase_wiki_pages(pagerank_score DESC);

-- JSONB indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_codebase_files_metadata_gin ON codebase_files USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_graph_analysis_results_gin ON codebase_graph_analysis USING GIN(results);
CREATE INDEX IF NOT EXISTS idx_mapreduce_jobs_metrics_gin ON codebase_mapreduce_jobs USING GIN(metrics);

-- ═══════════════════════════════════════════════════════════════════
-- Comments
-- ═══════════════════════════════════════════════════════════════════

COMMENT ON TABLE codebase_files IS 'Indexed codebase files with graph metrics from Neo4j';
COMMENT ON TABLE codebase_embeddings IS 'GPU-accelerated 768-dim embeddings via embeddinggemma';
COMMENT ON TABLE codebase_graph_analysis IS 'Results from Neo4j PageRank + LibTorch K-Means + Qdrant duplicates';
COMMENT ON TABLE codebase_mapreduce_jobs IS 'MapReduce batch jobs for GPU-accelerated processing';
COMMENT ON TABLE codebase_wiki_pages IS 'Auto-generated wiki pages from semantic analysis';
COMMENT ON TABLE mapreduce_map_queue IS 'Map phase: chunks awaiting GPU embedding';
COMMENT ON TABLE mapreduce_reduce_results IS 'Reduce phase: aggregated GPU results';
COMMENT ON TABLE gpu_performance_metrics IS 'CUDA performance tracking for RTX 3060 Ti';
