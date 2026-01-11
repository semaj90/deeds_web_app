-- HNSW Index Optimization for Legal Document Characteristics
-- Tuned for your "tricubic tensor" PostgreSQL + pgvector implementation

-- ============================================================================
-- HNSW PARAMETER OPTIMIZATION FOR LEGAL AI PLATFORM
-- ============================================================================

-- Legal documents have specific characteristics that require tuned HNSW parameters:
-- 1. High-dimensional vectors (768 dims from nomic-embed-text)
-- 2. Cluster-heavy distribution (similar legal concepts group together)
-- 3. Mixed query patterns (broad searches + precision lookups)
-- 4. Batch insertions during document ingestion

-- ============================================================================
-- EVIDENCE TABLE VECTOR INDEXES (Primary Content Store)
-- ============================================================================

-- Drop existing indexes to recreate with optimized parameters
DROP INDEX IF EXISTS evidence_title_embedding_idx;
DROP INDEX IF EXISTS evidence_content_embedding_idx; 
DROP INDEX IF EXISTS evidence_summary_embedding_idx;

-- Optimized HNSW indexes for evidence content (most queried)
-- ef_construction=200: Higher build quality for better recall on legal clusters
-- m=24: Higher connectivity for dense legal concept relationships

CREATE INDEX evidence_content_embedding_hnsw_optimized 
ON evidence 
USING hnsw (content_embedding vector_cosine_ops) 
WITH (ef_construction = 200, m = 24);

-- Title embeddings: Lower parameters since titles are shorter/simpler
CREATE INDEX evidence_title_embedding_hnsw_optimized 
ON evidence 
USING hnsw (title_embedding vector_cosine_ops) 
WITH (ef_construction = 150, m = 16);

-- Summary embeddings: Medium parameters for balanced performance
CREATE INDEX evidence_summary_embedding_hnsw_optimized 
ON evidence 
USING hnsw (summary_embedding vector_embedding_ops) 
WITH (ef_construction = 180, m = 20);

-- ============================================================================
-- CASES TABLE VECTOR INDEXES (Hierarchical Context)
-- ============================================================================

-- Drop existing case indexes
DROP INDEX IF EXISTS cases_title_embedding_idx;
DROP INDEX IF EXISTS cases_description_embedding_idx;
DROP INDEX IF EXISTS cases_fulltext_embedding_idx;

-- Case descriptions: High-quality build for comprehensive legal context
CREATE INDEX cases_description_embedding_hnsw_optimized 
ON cases 
USING hnsw (description_embedding vector_cosine_ops) 
WITH (ef_construction = 250, m = 32);

-- Case titles: Fast search for case identification
CREATE INDEX cases_title_embedding_hnsw_optimized 
ON cases 
USING hnsw (title_embedding vector_cosine_ops) 
WITH (ef_construction = 120, m = 12);

-- Full-text embeddings: Balanced for comprehensive case analysis
CREATE INDEX cases_fulltext_embedding_hnsw_optimized 
ON cases 
USING hnsw (full_text_embedding vector_cosine_ops) 
WITH (ef_construction = 200, m = 24);

-- ============================================================================
-- LEGAL DOCUMENTS TABLE VECTOR INDEXES (Document Repository)
-- ============================================================================

-- Drop existing legal document indexes
DROP INDEX IF EXISTS legal_documents_title_embedding_idx;
DROP INDEX IF EXISTS legal_documents_content_embedding_idx;

-- Legal document content: Highest quality for precise legal matching
CREATE INDEX legal_documents_content_embedding_hnsw_optimized 
ON legal_documents 
USING hnsw (content_embedding vector_cosine_ops) 
WITH (ef_construction = 300, m = 40);

-- Legal document titles: Medium quality for document discovery
CREATE INDEX legal_documents_title_embedding_hnsw_optimized 
ON legal_documents 
USING hnsw (title_embedding vector_cosine_ops) 
WITH (ef_construction = 160, m = 18);

-- ============================================================================
-- RUNTIME SEARCH OPTIMIZATION SETTINGS
-- ============================================================================

-- Set optimal ef (search width) for different query patterns
-- These can be adjusted per-query in your application

-- For broad legal research (high recall needed)
-- SET hnsw.ef_search = 200;

-- For precise case matching (balanced precision/recall)  
-- SET hnsw.ef_search = 100;

-- For real-time user queries (speed prioritized)
-- SET hnsw.ef_search = 50;

-- ============================================================================
-- HYBRID INDEX STRATEGY FOR LEGAL METADATA
-- ============================================================================

-- Complement vector indexes with traditional indexes for hybrid search
-- Your enhanced-vector-operations.ts hybridSearch() method uses these

-- Evidence metadata indexing for filtered vector search
CREATE INDEX evidence_metadata_gin_idx ON evidence USING gin (metadata);
CREATE INDEX evidence_type_priority_idx ON evidence (evidence_type, uploaded_at DESC);
CREATE INDEX evidence_case_date_idx ON evidence (case_id, uploaded_at DESC);

-- Case metadata indexing for contextual filtering
CREATE INDEX cases_metadata_gin_idx ON cases USING gin (metadata);
CREATE INDEX cases_priority_status_idx ON cases (priority, status, created_at DESC);
CREATE INDEX cases_jurisdiction_idx ON cases (jurisdiction) WHERE jurisdiction IS NOT NULL;

-- Multi-column indexes for common filter combinations
CREATE INDEX evidence_hybrid_search_idx ON evidence (case_id, evidence_type, is_admissible, uploaded_at DESC);
CREATE INDEX cases_hybrid_search_idx ON cases (status, priority, jurisdiction, created_at DESC);

-- ============================================================================
-- MAINTENANCE AND MONITORING
-- ============================================================================

-- Function to analyze vector index performance
CREATE OR REPLACE FUNCTION analyze_vector_index_performance()
RETURNS TABLE(
    table_name text,
    index_name text,
    index_size text,
    estimated_rows bigint,
    last_analyzed timestamp
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname || '.' || tablename as table_name,
        indexname as index_name,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
        n_tup_ins + n_tup_upd as estimated_rows,
        last_analyze as last_analyzed
    FROM pg_stat_user_indexes sui
    JOIN pg_indexes pi ON sui.indexrelname = pi.indexname
    WHERE pi.indexname LIKE '%embedding%hnsw%'
    ORDER BY pg_relation_size(indexrelid) DESC;
END;
$$ LANGUAGE plpgsql;

-- Monitor vector search query performance
CREATE OR REPLACE VIEW vector_query_stats AS
SELECT 
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins,
    n_tup_upd,
    n_tup_del,
    last_vacuum,
    last_analyze
FROM pg_stat_user_tables 
WHERE tablename IN ('evidence', 'cases', 'legal_documents');

-- ============================================================================
-- VECTOR QUANTIZATION PREPARATION (Future Optimization)
-- ============================================================================

-- Prepare for vector quantization to reduce storage and improve cache performance
-- This aligns with your "texture streaming" concept

-- Add quantized embedding columns (future enhancement)
-- ALTER TABLE evidence ADD COLUMN content_embedding_quantized bytea;
-- ALTER TABLE cases ADD COLUMN description_embedding_quantized bytea;
-- ALTER TABLE legal_documents ADD COLUMN content_embedding_quantized bytea;

-- Function to convert float32 embeddings to int8 quantized (4x compression)
CREATE OR REPLACE FUNCTION quantize_embedding(embedding vector, scale_factor real DEFAULT 127.0)
RETURNS bytea AS $$
DECLARE
    quantized bytea;
    element real;
    byte_val int;
BEGIN
    quantized := '\x'::bytea;
    
    -- Convert each dimension to signed int8 (-128 to 127)
    FOR i IN 1..array_length(embedding::real[], 1) LOOP
        element := embedding[i];
        -- Scale and clamp to int8 range
        byte_val := GREATEST(-128, LEAST(127, round(element * scale_factor)::int));
        -- Append as signed byte (convert to unsigned for bytea)
        quantized := quantized || decode(to_hex((byte_val + 256) % 256), 'hex');
    END LOOP;
    
    RETURN quantized;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- SEARCH PERFORMANCE TESTING QUERIES
-- ============================================================================

-- Test query performance with EXPLAIN ANALYZE
-- Run these to verify your HNSW optimization is working

/*

-- Example: Test evidence content search performance
EXPLAIN (ANALYZE, BUFFERS) 
SELECT 
    id, title, 
    1 - (content_embedding <=> '[0.1,0.2,0.3...]'::vector) as similarity
FROM evidence 
WHERE 1 - (content_embedding <=> '[0.1,0.2,0.3...]'::vector) > 0.7
ORDER BY content_embedding <=> '[0.1,0.2,0.3...]'::vector
LIMIT 10;

-- Should show:
-- -> Index Scan using evidence_content_embedding_hnsw_optimized
-- -> No Seq Scan (table scan) should appear

-- Example: Test hybrid search performance  
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    e.id, e.title,
    1 - (e.content_embedding <=> '[0.1,0.2,0.3...]'::vector) as similarity,
    c.case_number, c.priority
FROM evidence e
JOIN cases c ON e.case_id = c.id
WHERE 1 - (e.content_embedding <=> '[0.1,0.2,0.3...]'::vector) > 0.7
    AND e.evidence_type = 'document'
    AND c.priority = 'high'
ORDER BY e.content_embedding <=> '[0.1,0.2,0.3...]'::vector
LIMIT 20;

-- Should show:
-- -> Nested Loop joins with index scans
-- -> No sequential scans on large tables

*/

-- ============================================================================
-- VACUUM AND MAINTENANCE SCHEDULE
-- ============================================================================

-- HNSW indexes benefit from regular maintenance
-- Schedule these in your production environment:

-- Daily: Update table statistics for query planner
-- ANALYZE evidence, cases, legal_documents;

-- Weekly: Vacuum to reclaim space and update visibility maps
-- VACUUM (ANALYZE) evidence, cases, legal_documents;

-- Monthly: Full vacuum for heavily updated tables
-- VACUUM FULL legal_documents; -- Only if fragmentation is high

-- ============================================================================
-- CONFIGURATION TUNING FOR LEGAL AI WORKLOAD
-- ============================================================================

-- PostgreSQL configuration recommendations for legal AI vector workload:

/*
# Memory settings for vector operations
shared_buffers = 2GB                    # 25% of RAM for caching
effective_cache_size = 6GB              # Total system cache estimate
work_mem = 256MB                        # Per-operation memory for sorts/hashes

# Query planner settings for vector search
random_page_cost = 1.1                  # SSD-optimized
effective_io_concurrency = 200          # Concurrent I/O operations

# Background writer settings for batch ingestion
bgwriter_lru_maxpages = 1000            # Background cleaning
bgwriter_lru_multiplier = 10.0          # Aggressive cleaning ratio

# Checkpoint settings for write-heavy workloads
checkpoint_completion_target = 0.9       # Spread checkpoints
wal_buffers = 64MB                       # WAL buffer size
*/

-- ============================================================================
-- SUCCESS METRICS TO MONITOR
-- ============================================================================

-- Monitor these metrics to validate your HNSW optimization:

-- 1. Query Performance: avg_exec_time < 50ms for vector searches
-- 2. Index Usage: idx_scan > seq_scan for embedding columns  
-- 3. Cache Hit Ratio: > 95% for frequently accessed embeddings
-- 4. Index Size: Reasonable growth with document volume
-- 5. Memory Usage: work_mem sufficient for complex hybrid queries

SELECT 'HNSW Vector Index Optimization Complete - Legal AI Platform Ready' as status;