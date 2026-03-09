-- Enhanced PostgreSQL Schema with JSONB for Advanced Legal AI System
-- Production-ready schema with JSONB, vector extensions, and performance optimizations

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enhanced legal documents table with JSONB metadata
CREATE TABLE IF NOT EXISTS legal_documents_enhanced (
    id BIGSERIAL PRIMARY KEY,
    case_id VARCHAR(255) NOT NULL,
    document_type VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    
    -- JSONB fields for flexible metadata
    metadata JSONB NOT NULL DEFAULT '{}',
    entities JSONB NOT NULL DEFAULT '[]',
    analysis_results JSONB NOT NULL DEFAULT '{}',
    compliance_status JSONB NOT NULL DEFAULT '{}',
    tags JSONB NOT NULL DEFAULT '[]',
    
    -- Vector embeddings
    content_embedding vector(384),
    title_embedding vector(384),
    
    -- Timestamps and tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Status tracking
    processing_status VARCHAR(50) DEFAULT 'pending',
    version INTEGER DEFAULT 1,
    
    -- Full-text search
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', title || ' ' || content)
    ) STORED
);

-- Enhanced error analysis table with JSONB patterns
CREATE TABLE IF NOT EXISTS error_analysis_enhanced (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL DEFAULT gen_random_uuid(),
    
    -- Error data in JSONB format
    error_data JSONB NOT NULL,
    patterns JSONB NOT NULL DEFAULT '[]',
    fixes JSONB NOT NULL DEFAULT '[]',
    recommendations JSONB NOT NULL DEFAULT '[]',
    
    -- ML analysis results
    ml_confidence DECIMAL(5,4) DEFAULT 0.0,
    pattern_vectors JSONB NOT NULL DEFAULT '{}',
    similarity_scores JSONB NOT NULL DEFAULT '{}',
    
    -- Performance metrics
    processing_time_ms INTEGER,
    worker_id VARCHAR(100),
    gpu_processed BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Enhanced memory graph with JSONB relationships
CREATE TABLE IF NOT EXISTS memory_graph_enhanced (
    id BIGSERIAL PRIMARY KEY,
    node_id UUID NOT NULL DEFAULT gen_random_uuid(),
    
    -- Node data
    node_type VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    properties JSONB NOT NULL DEFAULT '{}',
    
    -- Relationships and connections
    relationships JSONB NOT NULL DEFAULT '[]',
    connections JSONB NOT NULL DEFAULT '[]',
    semantic_features JSONB NOT NULL DEFAULT '[]',
    
    -- Vector representations
    node_embedding vector(384),
    
    -- Graph metadata
    centrality_scores JSONB NOT NULL DEFAULT '{}',
    cluster_info JSONB NOT NULL DEFAULT '{}',
    
    -- Timestamps and versioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Worker tracking
    worker_id VARCHAR(100),
    
    UNIQUE(node_id)
);

-- Enhanced agent orchestration logs with JSONB
CREATE TABLE IF NOT EXISTS agent_orchestration_logs (
    id BIGSERIAL PRIMARY KEY,
    request_id UUID NOT NULL,
    
    -- Orchestration data
    prompt TEXT NOT NULL,
    context_data JSONB NOT NULL DEFAULT '{}',
    agent_results JSONB NOT NULL DEFAULT '[]',
    synthesis_result JSONB NOT NULL DEFAULT '{}',
    
    -- Performance metrics
    metrics JSONB NOT NULL DEFAULT '{}',
    timing_data JSONB NOT NULL DEFAULT '{}',
    resource_usage JSONB NOT NULL DEFAULT '{}',
    
    -- Status and errors
    status VARCHAR(50) DEFAULT 'pending',
    errors JSONB NOT NULL DEFAULT '[]',
    warnings JSONB NOT NULL DEFAULT '[]',
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Configuration
    options JSONB NOT NULL DEFAULT '{}'
);

-- Enhanced service health monitoring with JSONB metrics
CREATE TABLE IF NOT EXISTS service_health_enhanced (
    id BIGSERIAL PRIMARY KEY,
    service_id VARCHAR(100) NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    
    -- Health status
    status VARCHAR(50) NOT NULL,
    response_time_ms INTEGER,
    
    -- Detailed metrics in JSONB
    endpoint_health JSONB NOT NULL DEFAULT '[]',
    resource_metrics JSONB NOT NULL DEFAULT '{}',
    performance_data JSONB NOT NULL DEFAULT '{}',
    
    -- GPU monitoring data
    gpu_metrics JSONB NOT NULL DEFAULT '{}',
    
    -- Dependencies and alerts
    dependencies JSONB NOT NULL DEFAULT '[]',
    alerts JSONB NOT NULL DEFAULT '[]',
    
    -- Timestamps
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Worker and cluster info
    worker_id VARCHAR(100),
    cluster_node VARCHAR(100)
);

-- Enhanced caching table with JSONB metadata
CREATE TABLE IF NOT EXISTS cache_enhanced (
    id BIGSERIAL PRIMARY KEY,
    cache_key VARCHAR(255) NOT NULL,
    
    -- Cache data
    cache_value JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Cache statistics
    hit_count INTEGER DEFAULT 0,
    miss_count INTEGER DEFAULT 0,
    access_patterns JSONB NOT NULL DEFAULT '[]',
    
    -- Expiration and TTL
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Cache hierarchy
    cache_layer VARCHAR(50) DEFAULT 'L1',
    priority INTEGER DEFAULT 1,
    
    UNIQUE(cache_key)
);

-- Performance optimization table with JSONB suggestions
CREATE TABLE IF NOT EXISTS performance_optimizations (
    id BIGSERIAL PRIMARY KEY,
    
    -- Optimization data
    target_service VARCHAR(100) NOT NULL,
    optimization_type VARCHAR(100) NOT NULL,
    suggestions JSONB NOT NULL DEFAULT '[]',
    
    -- Performance impact
    before_metrics JSONB NOT NULL DEFAULT '{}',
    after_metrics JSONB NOT NULL DEFAULT '{}',
    improvement_data JSONB NOT NULL DEFAULT '{}',
    
    -- Implementation status
    status VARCHAR(50) DEFAULT 'suggested',
    applied_at TIMESTAMP WITH TIME ZONE,
    
    -- ML-based analysis
    ml_confidence DECIMAL(5,4) DEFAULT 0.0,
    analysis_metadata JSONB NOT NULL DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- JSONB Indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_legal_docs_metadata_gin ON legal_documents_enhanced USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_legal_docs_entities_gin ON legal_documents_enhanced USING GIN (entities);
CREATE INDEX IF NOT EXISTS idx_legal_docs_analysis_gin ON legal_documents_enhanced USING GIN (analysis_results);
CREATE INDEX IF NOT EXISTS idx_legal_docs_compliance_gin ON legal_documents_enhanced USING GIN (compliance_status);
CREATE INDEX IF NOT EXISTS idx_legal_docs_tags_gin ON legal_documents_enhanced USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_legal_docs_search ON legal_documents_enhanced USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_error_analysis_data_gin ON error_analysis_enhanced USING GIN (error_data);
CREATE INDEX IF NOT EXISTS idx_error_analysis_patterns_gin ON error_analysis_enhanced USING GIN (patterns);
CREATE INDEX IF NOT EXISTS idx_error_analysis_fixes_gin ON error_analysis_enhanced USING GIN (fixes);

CREATE INDEX IF NOT EXISTS idx_memory_graph_properties_gin ON memory_graph_enhanced USING GIN (properties);
CREATE INDEX IF NOT EXISTS idx_memory_graph_relationships_gin ON memory_graph_enhanced USING GIN (relationships);
CREATE INDEX IF NOT EXISTS idx_memory_graph_features_gin ON memory_graph_enhanced USING GIN (semantic_features);

CREATE INDEX IF NOT EXISTS idx_orchestration_context_gin ON agent_orchestration_logs USING GIN (context_data);
CREATE INDEX IF NOT EXISTS idx_orchestration_results_gin ON agent_orchestration_logs USING GIN (agent_results);
CREATE INDEX IF NOT EXISTS idx_orchestration_metrics_gin ON agent_orchestration_logs USING GIN (metrics);

CREATE INDEX IF NOT EXISTS idx_service_health_endpoints_gin ON service_health_enhanced USING GIN (endpoint_health);
CREATE INDEX IF NOT EXISTS idx_service_health_resources_gin ON service_health_enhanced USING GIN (resource_metrics);
CREATE INDEX IF NOT EXISTS idx_service_health_gpu_gin ON service_health_enhanced USING GIN (gpu_metrics);

CREATE INDEX IF NOT EXISTS idx_cache_metadata_gin ON cache_enhanced USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_cache_access_patterns_gin ON cache_enhanced USING GIN (access_patterns);

-- Vector similarity indexes
CREATE INDEX IF NOT EXISTS idx_legal_docs_content_vector ON legal_documents_enhanced USING ivfflat (content_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_legal_docs_title_vector ON legal_documents_enhanced USING ivfflat (title_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_memory_graph_vector ON memory_graph_enhanced USING ivfflat (node_embedding vector_cosine_ops);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_legal_docs_case_type ON legal_documents_enhanced (case_id, document_type);
CREATE INDEX IF NOT EXISTS idx_legal_docs_status_created ON legal_documents_enhanced (processing_status, created_at);
CREATE INDEX IF NOT EXISTS idx_error_analysis_session_created ON error_analysis_enhanced (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_graph_type_updated ON memory_graph_enhanced (node_type, updated_at);
CREATE INDEX IF NOT EXISTS idx_service_health_service_checked ON service_health_enhanced (service_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_cache_key_expires ON cache_enhanced (cache_key, expires_at);

-- Trigger functions for JSONB validation and updates
CREATE OR REPLACE FUNCTION validate_jsonb_structure()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate metadata structure for legal documents
    IF TG_TABLE_NAME = 'legal_documents_enhanced' THEN
        -- Ensure metadata has required fields
        IF NOT (NEW.metadata ? 'document_version') THEN
            NEW.metadata = NEW.metadata || '{"document_version": 1}';
        END IF;
        
        -- Ensure entities is an array
        IF jsonb_typeof(NEW.entities) != 'array' THEN
            NEW.entities = '[]';
        END IF;
        
        -- Update timestamp
        NEW.updated_at = NOW();
    END IF;
    
    -- Validate error analysis structure
    IF TG_TABLE_NAME = 'error_analysis_enhanced' THEN
        -- Ensure patterns is an array
        IF jsonb_typeof(NEW.patterns) != 'array' THEN
            NEW.patterns = '[]';
        END IF;
        
        -- Ensure fixes is an array
        IF jsonb_typeof(NEW.fixes) != 'array' THEN
            NEW.fixes = '[]';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for JSONB validation
CREATE TRIGGER legal_docs_jsonb_validation
    BEFORE INSERT OR UPDATE ON legal_documents_enhanced
    FOR EACH ROW EXECUTE FUNCTION validate_jsonb_structure();

CREATE TRIGGER error_analysis_jsonb_validation
    BEFORE INSERT OR UPDATE ON error_analysis_enhanced
    FOR EACH ROW EXECUTE FUNCTION validate_jsonb_structure();

-- Function for advanced JSONB queries
CREATE OR REPLACE FUNCTION search_legal_documents_jsonb(
    search_term TEXT,
    metadata_filters JSONB DEFAULT '{}',
    entity_filters JSONB DEFAULT '{}',
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    id BIGINT,
    case_id VARCHAR(255),
    title TEXT,
    metadata JSONB,
    entities JSONB,
    similarity_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ld.id,
        ld.case_id,
        ld.title,
        ld.metadata,
        ld.entities,
        ts_rank(ld.search_vector, plainto_tsquery('english', search_term)) AS similarity_score
    FROM legal_documents_enhanced ld
    WHERE 
        (search_term IS NULL OR ld.search_vector @@ plainto_tsquery('english', search_term))
        AND (metadata_filters = '{}' OR ld.metadata @> metadata_filters)
        AND (entity_filters = '{}' OR ld.entities @> entity_filters)
    ORDER BY similarity_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function for JSONB aggregation and analytics
CREATE OR REPLACE FUNCTION get_service_health_analytics(
    service_filter VARCHAR(100) DEFAULT NULL,
    time_range INTERVAL DEFAULT '24 hours'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_checks', COUNT(*),
        'healthy_percentage', 
            ROUND(
                (COUNT(*) FILTER (WHERE status = 'healthy')::DECIMAL / COUNT(*)) * 100, 
                2
            ),
        'average_response_time', AVG(response_time_ms),
        'resource_averages', jsonb_build_object(
            'cpu_usage', AVG((resource_metrics->>'cpu_usage')::DECIMAL),
            'memory_usage', AVG((resource_metrics->>'memory_usage')::DECIMAL),
            'gpu_usage', AVG((gpu_metrics->>'gpu_usage')::DECIMAL)
        ),
        'alert_summary', jsonb_agg(
            DISTINCT jsonb_array_elements(alerts)
        ) FILTER (WHERE jsonb_array_length(alerts) > 0),
        'time_range', to_char(time_range, 'HH24:MI:SS')
    ) INTO result
    FROM service_health_enhanced
    WHERE 
        checked_at >= NOW() - time_range
        AND (service_filter IS NULL OR service_id = service_filter);
        
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Performance monitoring view with JSONB aggregations
CREATE OR REPLACE VIEW performance_dashboard AS
SELECT 
    'legal_documents' as table_name,
    COUNT(*) as total_records,
    jsonb_build_object(
        'avg_processing_time', AVG(EXTRACT(EPOCH FROM (processed_at - created_at))),
        'status_distribution', jsonb_object_agg(processing_status, status_count),
        'document_types', jsonb_object_agg(document_type, type_count)
    ) as metrics
FROM legal_documents_enhanced,
LATERAL (
    SELECT processing_status, COUNT(*) as status_count
    FROM legal_documents_enhanced
    GROUP BY processing_status
) status_stats,
LATERAL (
    SELECT document_type, COUNT(*) as type_count
    FROM legal_documents_enhanced
    GROUP BY document_type
) type_stats
GROUP BY table_name

UNION ALL

SELECT 
    'error_analysis' as table_name,
    COUNT(*) as total_records,
    jsonb_build_object(
        'avg_confidence', AVG(ml_confidence),
        'gpu_usage_percentage', 
            ROUND((COUNT(*) FILTER (WHERE gpu_processed = true)::DECIMAL / COUNT(*)) * 100, 2),
        'avg_processing_time', AVG(processing_time_ms)
    ) as metrics
FROM error_analysis_enhanced

UNION ALL

SELECT 
    'memory_graph' as table_name,
    COUNT(*) as total_records,
    jsonb_build_object(
        'node_types', jsonb_object_agg(node_type, type_count),
        'avg_connections', AVG(jsonb_array_length(connections)),
        'cluster_distribution', COUNT(DISTINCT (cluster_info->>'cluster_id'))
    ) as metrics
FROM memory_graph_enhanced,
LATERAL (
    SELECT node_type, COUNT(*) as type_count
    FROM memory_graph_enhanced
    GROUP BY node_type
) node_stats
GROUP BY table_name;

-- JSONB utility functions
CREATE OR REPLACE FUNCTION jsonb_merge_recursive(a JSONB, b JSONB)
RETURNS JSONB AS $$
BEGIN
    IF jsonb_typeof(a) = 'object' AND jsonb_typeof(b) = 'object' THEN
        RETURN (
            SELECT jsonb_object_agg(key, value)
            FROM (
                SELECT key, 
                    CASE 
                        WHEN a ? key AND b ? key AND 
                             jsonb_typeof(a->key) = 'object' AND 
                             jsonb_typeof(b->key) = 'object'
                        THEN jsonb_merge_recursive(a->key, b->key)
                        WHEN b ? key THEN b->key
                        ELSE a->key
                    END as value
                FROM (
                    SELECT DISTINCT key 
                    FROM (
                        SELECT jsonb_object_keys(a) as key
                        UNION
                        SELECT jsonb_object_keys(b) as key
                    ) keys
                ) all_keys
            ) merged
        );
    ELSE
        RETURN b;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create materialized view for fast analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS service_health_summary AS
SELECT 
    service_id,
    service_name,
    COUNT(*) as total_checks,
    AVG(response_time_ms) as avg_response_time,
    COUNT(*) FILTER (WHERE status = 'healthy') * 100.0 / COUNT(*) as health_percentage,
    jsonb_agg(
        jsonb_build_object(
            'timestamp', checked_at,
            'status', status,
            'response_time', response_time_ms
        ) ORDER BY checked_at DESC
    ) FILTER (WHERE checked_at >= NOW() - INTERVAL '24 hours') as recent_history,
    MAX(checked_at) as last_check
FROM service_health_enhanced
WHERE checked_at >= NOW() - INTERVAL '7 days'
GROUP BY service_id, service_name;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_health_summary_service 
    ON service_health_summary (service_id);

-- Refresh materialized view function
CREATE OR REPLACE FUNCTION refresh_service_health_summary()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY service_health_summary;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE legal_documents_enhanced IS 'Enhanced legal documents with JSONB metadata, vector embeddings, and full-text search';
COMMENT ON TABLE error_analysis_enhanced IS 'Enhanced error analysis with JSONB patterns, ML confidence scores, and GPU processing tracking';
COMMENT ON TABLE memory_graph_enhanced IS 'Enhanced memory graph with JSONB relationships, vector embeddings, and clustering information';
COMMENT ON TABLE agent_orchestration_logs IS 'Agent orchestration execution logs with JSONB context, results, and performance metrics';
COMMENT ON TABLE service_health_enhanced IS 'Enhanced service health monitoring with JSONB metrics, GPU monitoring, and alert tracking';
COMMENT ON TABLE cache_enhanced IS 'Enhanced caching layer with JSONB metadata, access patterns, and hierarchy support';
COMMENT ON TABLE performance_optimizations IS 'ML-driven performance optimization suggestions with JSONB before/after metrics';

COMMENT ON FUNCTION search_legal_documents_jsonb IS 'Advanced legal document search with JSONB metadata and entity filtering';
COMMENT ON FUNCTION get_service_health_analytics IS 'Comprehensive service health analytics with JSONB aggregations';
COMMENT ON FUNCTION jsonb_merge_recursive IS 'Recursive JSONB merge utility for complex data structures';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO legal_admin;