-- Enhanced PostgreSQL Schema with JSONB for AI Summarization
-- File: schema-jsonb-enhanced.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Drop existing tables if needed (careful in production!)
DROP TABLE IF EXISTS ai_summarized_documents CASCADE;
DROP TABLE IF EXISTS document_embeddings CASCADE;
DROP TABLE IF EXISTS summarization_jobs CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;

-- Create enum types
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'archived');
CREATE TYPE document_type AS ENUM ('contract', 'brief', 'case_study', 'memo', 'agreement', 'policy', 'other');
CREATE TYPE summary_style AS ENUM ('executive', 'technical', 'judicial', 'detailed', 'brief');
CREATE TYPE job_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- Main documents table with JSONB
CREATE TABLE ai_summarized_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_name VARCHAR(255) NOT NULL,
    document_type document_type DEFAULT 'other',
    original_text TEXT,
    file_path VARCHAR(500),
    file_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(original_text::bytea), 'hex')) STORED,
    
    -- JSONB fields for maximum flexibility
    metadata JSONB DEFAULT '{}' NOT NULL,
    summary JSONB DEFAULT '{}' NOT NULL,
    analysis JSONB DEFAULT '{}' NOT NULL,
    entities JSONB DEFAULT '[]' NOT NULL,
    citations JSONB DEFAULT '[]' NOT NULL,
    
    -- Structured summary data in JSONB
    summary_data JSONB DEFAULT '{
        "executive_summary": null,
        "key_findings": [],
        "legal_issues": [],
        "recommendations": [],
        "risk_assessment": {},
        "confidence_score": 0,
        "processing_metrics": {}
    }' NOT NULL,
    
    -- Processing information
    status document_status DEFAULT 'pending',
    processing_time_ms INTEGER,
    tokens_processed INTEGER,
    model_used VARCHAR(100),
    gpu_utilized BOOLEAN DEFAULT false,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    summarized_at TIMESTAMP WITH TIME ZONE,
    
    -- User tracking
    created_by UUID,
    updated_by UUID,
    
    -- Versioning
    version INTEGER DEFAULT 1,
    parent_document_id UUID REFERENCES ai_summarized_documents(id),
    
    -- Search optimization
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(document_name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(original_text, '')), 'D') ||
        setweight(to_tsvector('english', coalesce(summary->>'executive_summary', '')), 'B')
    ) STORED
);

-- Vector embeddings table for semantic search
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES ai_summarized_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1536), -- OpenAI embedding size, adjust as needed
    metadata JSONB DEFAULT '{}' NOT NULL,
    model_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(document_id, chunk_index)
);

-- Asynchronous job queue for summarization
CREATE TABLE summarization_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES ai_summarized_documents(id) ON DELETE CASCADE,
    
    -- Job configuration in JSONB
    config JSONB DEFAULT '{
        "style": "executive",
        "max_length": 500,
        "temperature": 0.2,
        "include_citations": true,
        "focus_areas": [],
        "language": "en"
    }' NOT NULL,
    
    -- Job status
    status document_status DEFAULT 'pending',
    priority job_priority DEFAULT 'normal',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Timing
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Results and errors
    result JSONB,
    error JSONB,
    
    -- Queue management
    locked_by VARCHAR(100),
    locked_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User preferences for summarization
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY,
    preferences JSONB DEFAULT '{
        "default_style": "executive",
        "max_summary_length": 500,
        "include_citations": true,
        "auto_summarize": false,
        "notification_settings": {
            "email": true,
            "push": false,
            "webhook_url": null
        },
        "api_limits": {
            "daily_quota": 100,
            "rate_limit_per_minute": 10
        }
    }' NOT NULL,
    statistics JSONB DEFAULT '{
        "total_documents": 0,
        "total_tokens": 0,
        "average_processing_time": 0,
        "last_activity": null
    }' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_documents_status ON ai_summarized_documents(status);
CREATE INDEX idx_documents_type ON ai_summarized_documents(document_type);
CREATE INDEX idx_documents_created_at ON ai_summarized_documents(created_at DESC);
CREATE INDEX idx_documents_search ON ai_summarized_documents USING GIN(search_vector);
CREATE INDEX idx_documents_metadata ON ai_summarized_documents USING GIN(metadata);
CREATE INDEX idx_documents_summary ON ai_summarized_documents USING GIN(summary);
CREATE INDEX idx_documents_entities ON ai_summarized_documents USING GIN(entities);

-- JSONB path indexes for common queries
CREATE INDEX idx_summary_confidence ON ai_summarized_documents ((summary_data->'confidence_score'));
CREATE INDEX idx_summary_findings ON ai_summarized_documents USING GIN((summary_data->'key_findings'));
CREATE INDEX idx_summary_issues ON ai_summarized_documents USING GIN((summary_data->'legal_issues'));

-- Embedding indexes
CREATE INDEX idx_embeddings_document ON document_embeddings(document_id);
CREATE INDEX idx_embeddings_vector ON document_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Job queue indexes
CREATE INDEX idx_jobs_status_priority ON summarization_jobs(status, priority DESC, scheduled_at);
CREATE INDEX idx_jobs_document ON summarization_jobs(document_id);
CREATE INDEX idx_jobs_locked ON summarization_jobs(locked_by, locked_at);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON ai_summarized_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON summarization_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get similar documents using embeddings
CREATE OR REPLACE FUNCTION find_similar_documents(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.8,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    document_id UUID,
    document_name VARCHAR,
    similarity FLOAT,
    summary JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (d.id)
        d.id,
        d.document_name,
        1 - (e.embedding <=> query_embedding) AS similarity,
        d.summary
    FROM document_embeddings e
    JOIN ai_summarized_documents d ON d.id = e.document_id
    WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
    ORDER BY d.id, similarity DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get document statistics
CREATE OR REPLACE FUNCTION get_document_statistics(
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP - INTERVAL '30 days',
    end_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_documents', COUNT(*),
        'completed_documents', COUNT(*) FILTER (WHERE status = 'completed'),
        'failed_documents', COUNT(*) FILTER (WHERE status = 'failed'),
        'average_processing_time_ms', AVG(processing_time_ms),
        'total_tokens_processed', SUM(tokens_processed),
        'gpu_utilization_rate', AVG(CASE WHEN gpu_utilized THEN 1 ELSE 0 END),
        'documents_by_type', jsonb_object_agg(
            document_type::text, 
            doc_count
        ) FROM (
            SELECT document_type, COUNT(*) as doc_count
            FROM ai_summarized_documents
            WHERE created_at BETWEEN start_date AND end_date
            GROUP BY document_type
        ) t,
        'average_confidence_score', AVG((summary_data->>'confidence_score')::FLOAT),
        'top_models_used', (
            SELECT jsonb_agg(model_info)
            FROM (
                SELECT jsonb_build_object(
                    'model', model_used,
                    'count', COUNT(*),
                    'avg_time', AVG(processing_time_ms)
                ) as model_info
                FROM ai_summarized_documents
                WHERE created_at BETWEEN start_date AND end_date
                AND model_used IS NOT NULL
                GROUP BY model_used
                ORDER BY COUNT(*) DESC
                LIMIT 5
            ) m
        )
    ) INTO stats
    FROM ai_summarized_documents
    WHERE created_at BETWEEN start_date AND end_date;
    
    RETURN stats;
END;
$$ LANGUAGE plpgsql;

-- Function to queue a summarization job
CREATE OR REPLACE FUNCTION queue_summarization_job(
    p_document_id UUID,
    p_config JSONB DEFAULT '{}',
    p_priority job_priority DEFAULT 'normal'
)
RETURNS UUID AS $$
DECLARE
    job_id UUID;
BEGIN
    INSERT INTO summarization_jobs (
        document_id,
        config,
        priority,
        status
    ) VALUES (
        p_document_id,
        p_config,
        p_priority,
        'pending'
    ) RETURNING id INTO job_id;
    
    -- Update document status
    UPDATE ai_summarized_documents
    SET status = 'pending'
    WHERE id = p_document_id;
    
    RETURN job_id;
END;
$$ LANGUAGE plpgsql;

-- Materialized view for frequently accessed summaries
CREATE MATERIALIZED VIEW recent_summaries AS
SELECT 
    d.id,
    d.document_name,
    d.document_type,
    d.summary_data->>'executive_summary' as executive_summary,
    d.summary_data->'confidence_score' as confidence_score,
    d.created_at,
    d.processing_time_ms,
    d.model_used
FROM ai_summarized_documents d
WHERE d.status = 'completed'
AND d.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY d.created_at DESC;

-- Create index on materialized view
CREATE INDEX idx_recent_summaries_created ON recent_summaries(created_at DESC);

-- Sample data insertion for testing
INSERT INTO ai_summarized_documents (
    document_name,
    document_type,
    original_text,
    summary_data,
    metadata,
    status,
    processing_time_ms,
    tokens_processed,
    model_used,
    gpu_utilized
) VALUES (
    'Sample Purchase Agreement',
    'contract',
    'This Purchase Agreement is entered into between ABC Corp and XYZ LLC...',
    jsonb_build_object(
        'executive_summary', 'Purchase agreement for $5M acquisition with 30-day closing period.',
        'key_findings', jsonb_build_array(
            'Purchase price: $5,000,000',
            'Closing date: 30 days from execution',
            'Clear title warranty included'
        ),
        'legal_issues', jsonb_build_array(
            jsonb_build_object(
                'issue', 'Indemnification clause scope',
                'severity', 'MEDIUM',
                'description', 'Mutual indemnification may need clarification'
            )
        ),
        'confidence_score', 0.92,
        'processing_metrics', jsonb_build_object(
            'chunks_processed', 5,
            'gpu_memory_used_mb', 1024,
            'model_temperature', 0.2
        )
    ),
    jsonb_build_object(
        'source', 'upload',
        'file_size_bytes', 15000,
        'pages', 10,
        'language', 'en'
    ),
    'completed',
    1250,
    512,
    'gemma3-legal:latest',
    true
);

-- Grant permissions (adjust as needed)
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO your_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;

-- Comments for documentation
COMMENT ON TABLE ai_summarized_documents IS 'Main table for AI-summarized legal documents with JSONB storage';
COMMENT ON COLUMN ai_summarized_documents.summary_data IS 'Structured summary data in JSONB format for flexible querying';
COMMENT ON COLUMN ai_summarized_documents.metadata IS 'Flexible metadata storage for document properties';
COMMENT ON COLUMN document_embeddings.embedding IS 'Vector embeddings for semantic similarity search';
COMMENT ON TABLE summarization_jobs IS 'Async job queue for document summarization processing';
