-- Phase 89: Enhanced Knowledge Base Schema
-- PostgreSQL + pgvector for enhanced tags, file analyses, and cluster summaries

-- Enhanced Tags Table (AI-analyzed tags with embeddings)
CREATE TABLE IF NOT EXISTS phase89_enhanced_tags (
    id SERIAL PRIMARY KEY,
    tag_name VARCHAR(255) UNIQUE NOT NULL,
    summary TEXT NOT NULL,
    embedding vector(768), -- embeddinggemma:latest dimension
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enhanced_tags_name ON phase89_enhanced_tags(tag_name);
CREATE INDEX IF NOT EXISTS idx_enhanced_tags_embedding ON phase89_enhanced_tags USING ivfflat (embedding vector_cosine_ops);

-- File Analyses Table (ripgrep + gemma3-legal analysis)
CREATE TABLE IF NOT EXISTS phase89_file_analyses (
    id SERIAL PRIMARY KEY,
    file_path VARCHAR(500) UNIQUE NOT NULL,
    summary TEXT NOT NULL,
    comments JSONB DEFAULT '[]',
    error_count INTEGER DEFAULT 0,
    recommendations JSONB DEFAULT '[]',
    qdrant_tag JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_analyses_path ON phase89_file_analyses(file_path);
CREATE INDEX IF NOT EXISTS idx_file_analyses_error_count ON phase89_file_analyses(error_count DESC);

-- Cluster Summaries Table (CUDA + gemma3-legal summaries)
CREATE TABLE IF NOT EXISTS phase89_cluster_summaries (
    id SERIAL PRIMARY KEY,
    cluster_id INTEGER UNIQUE NOT NULL,
    summary TEXT NOT NULL,
    tags JSONB DEFAULT '[]',
    error_count INTEGER DEFAULT 0,
    recommendations JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cluster_summaries_id ON phase89_cluster_summaries(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_summaries_error_count ON phase89_cluster_summaries(error_count DESC);

-- Update metadata function
CREATE OR REPLACE FUNCTION update_phase89_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_enhanced_tags_timestamp
    BEFORE UPDATE ON phase89_enhanced_tags
    FOR EACH ROW
    EXECUTE FUNCTION update_phase89_timestamp();

CREATE TRIGGER update_file_analyses_timestamp
    BEFORE UPDATE ON phase89_file_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_phase89_timestamp();

CREATE TRIGGER update_cluster_summaries_timestamp
    BEFORE UPDATE ON phase89_cluster_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_phase89_timestamp();

-- View: Enhanced tags with occurrence counts
CREATE OR REPLACE VIEW phase89_tag_stats AS
SELECT
    et.tag_name,
    et.summary,
    (et.metadata->>'count')::INTEGER as occurrence_count,
    et.metadata->'relatedTags' as related_tags,
    et.created_at,
    et.updated_at
FROM phase89_enhanced_tags et
ORDER BY (et.metadata->>'count')::INTEGER DESC;

-- View: File analysis summary
CREATE OR REPLACE VIEW phase89_file_stats AS
SELECT
    fa.file_path,
    fa.summary,
    fa.error_count,
    jsonb_array_length(fa.comments) as comment_count,
    jsonb_array_length(fa.recommendations) as recommendation_count,
    fa.qdrant_tag->'name' as qdrant_tag_name,
    fa.updated_at
FROM phase89_file_analyses fa
ORDER BY fa.error_count DESC;

-- View: Cluster summary dashboard
CREATE OR REPLACE VIEW phase89_cluster_dashboard AS
SELECT
    cs.cluster_id,
    cs.summary,
    cs.error_count,
    jsonb_array_length(cs.tags) as tag_count,
    jsonb_array_length(cs.recommendations) as recommendation_count,
    cs.metadata->>'cudaAnalysis' as cuda_analyzed,
    cs.updated_at
FROM phase89_cluster_summaries cs
ORDER BY cs.error_count DESC;

COMMENT ON TABLE phase89_enhanced_tags IS 'AI-enhanced Qdrant tags with embeddings and summaries';
COMMENT ON TABLE phase89_file_analyses IS 'File-level analysis with ripgrep + gemma3-legal';
COMMENT ON TABLE phase89_cluster_summaries IS 'CUDA-clustered error summaries with recommendations';
