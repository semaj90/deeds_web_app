-- ═══════════════════════════════════════════════════════════════════════
-- Agentic Knowledge Integration V2 - PostgreSQL Schema
-- ═══════════════════════════════════════════════════════════════════════
-- Date: January 2, 2026
-- Purpose: Enhanced knowledge base with multi-DB coordination
-- ═══════════════════════════════════════════════════════════════════════

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ───────────────────────────────────────────────────────────────────────
-- Clusters Table
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    summary TEXT NOT NULL,
    centroid FLOAT[] NOT NULL,
    size INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clusters_created_at ON clusters(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_size ON clusters(size DESC);

-- ───────────────────────────────────────────────────────────────────────
-- Enhanced Tags Table
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enhanced_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('file', 'function', 'component', 'error', 'pattern')),
    file_path TEXT NOT NULL,
    line_number INTEGER,
    ast_node_type VARCHAR(100),
    error_type VARCHAR(100),
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    summary TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cluster_id UUID,
    qdrant_id TEXT,
    neo4j_id TEXT,
    couchdb_id TEXT,
    CONSTRAINT fk_cluster FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_enhanced_tags_category ON enhanced_tags(category);
CREATE INDEX IF NOT EXISTS idx_enhanced_tags_file_path ON enhanced_tags(file_path);
CREATE INDEX IF NOT EXISTS idx_enhanced_tags_timestamp ON enhanced_tags(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_enhanced_tags_cluster_id ON enhanced_tags(cluster_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_tags_error_type ON enhanced_tags(error_type) WHERE error_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enhanced_tags_confidence ON enhanced_tags(confidence DESC) WHERE confidence IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────
-- Recommendations Table
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tag_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('fix', 'refactor', 'optimize')),
    description TEXT NOT NULL,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMPTZ,
    CONSTRAINT fk_tag FOREIGN KEY (tag_id) REFERENCES enhanced_tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendations_tag_id ON recommendations(tag_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(type);
CREATE INDEX IF NOT EXISTS idx_recommendations_confidence ON recommendations(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_applied ON recommendations(applied, applied_at);

-- ───────────────────────────────────────────────────────────────────────
-- Error Analysis Table
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS error_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tag_id UUID NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    ast_context JSONB,
    analysis TEXT,
    fixed BOOLEAN DEFAULT FALSE,
    fixed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_tag FOREIGN KEY (tag_id) REFERENCES enhanced_tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_error_analysis_tag_id ON error_analysis(tag_id);
CREATE INDEX IF NOT EXISTS idx_error_analysis_fixed ON error_analysis(fixed, fixed_at);
CREATE INDEX IF NOT EXISTS idx_error_analysis_created_at ON error_analysis(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_analysis_ast_context ON error_analysis USING GIN (ast_context);

-- ───────────────────────────────────────────────────────────────────────
-- Multi-Database Transaction Log
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS multi_db_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'committed', 'rolled_back', 'failed')),
    databases TEXT[] NOT NULL,
    payload JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_multi_db_transactions_status ON multi_db_transactions(status);
CREATE INDEX IF NOT EXISTS idx_multi_db_transactions_created_at ON multi_db_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_multi_db_transactions_operation ON multi_db_transactions(operation);

-- ───────────────────────────────────────────────────────────────────────
-- Retry Queue Table
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retry_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL,
    operation VARCHAR(50) NOT NULL,
    database VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'retrying', 'succeeded', 'failed', 'dead_letter')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_transaction FOREIGN KEY (transaction_id) REFERENCES multi_db_transactions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_status ON retry_queue(status);
CREATE INDEX IF NOT EXISTS idx_retry_queue_next_retry ON retry_queue(next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_retry_queue_transaction_id ON retry_queue(transaction_id);

-- ───────────────────────────────────────────────────────────────────────
-- File Metadata Table (for codebase indexing)
-- Note: Renamed from file_index to avoid conflict with existing table
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_path TEXT NOT NULL UNIQUE,
    file_hash VARCHAR(64) NOT NULL,
    language VARCHAR(50),
    loc INTEGER,
    last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified_at TIMESTAMPTZ,
    tag_id UUID,
    CONSTRAINT fk_tag_file_metadata FOREIGN KEY (tag_id) REFERENCES enhanced_tags(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_file_metadata_file_path ON file_metadata(file_path);
CREATE INDEX IF NOT EXISTS idx_file_metadata_language ON file_metadata(language);
CREATE INDEX IF NOT EXISTS idx_file_metadata_last_indexed ON file_metadata(last_indexed_at DESC);

-- ───────────────────────────────────────────────────────────────────────
-- Pattern Search Cache Table
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pattern_search_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    context TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_pattern_search_pattern ON pattern_search_cache(pattern);
CREATE INDEX IF NOT EXISTS idx_pattern_search_file_path ON pattern_search_cache(file_path);
CREATE INDEX IF NOT EXISTS idx_pattern_search_expires ON pattern_search_cache(expires_at);

-- ───────────────────────────────────────────────────────────────────────
-- Views for Analytics
-- ───────────────────────────────────────────────────────────────────────

-- View: Tag statistics by category
CREATE OR REPLACE VIEW tag_stats_by_category AS
SELECT
    category,
    COUNT(*) as total_tags,
    COUNT(cluster_id) as clustered_tags,
    AVG(confidence) as avg_confidence,
    COUNT(DISTINCT file_path) as unique_files
FROM enhanced_tags
GROUP BY category;

-- View: Recent recommendations
CREATE OR REPLACE VIEW recent_recommendations AS
SELECT
    r.id,
    r.type,
    r.description,
    r.confidence,
    r.created_at,
    r.applied,
    t.file_path,
    t.category,
    t.error_type
FROM recommendations r
JOIN enhanced_tags t ON r.tag_id = t.id
ORDER BY r.created_at DESC;

-- View: Error resolution rate
CREATE OR REPLACE VIEW error_resolution_stats AS
SELECT
    t.error_type,
    COUNT(*) as total_errors,
    COUNT(CASE WHEN ea.fixed THEN 1 END) as fixed_errors,
    ROUND(100.0 * COUNT(CASE WHEN ea.fixed THEN 1 END) / COUNT(*), 2) as fix_rate_percent,
    AVG(EXTRACT(EPOCH FROM (ea.fixed_at - ea.created_at))) as avg_fix_time_seconds
FROM enhanced_tags t
JOIN error_analysis ea ON t.id = ea.tag_id
WHERE t.error_type IS NOT NULL
GROUP BY t.error_type;

-- View: Cluster summary
CREATE OR REPLACE VIEW cluster_summary AS
SELECT
    c.id,
    c.summary,
    c.size,
    c.created_at,
    COUNT(t.id) as actual_tag_count,
    ARRAY_AGG(DISTINCT t.category) as categories,
    ARRAY_AGG(DISTINCT t.file_path) as sample_files
FROM clusters c
LEFT JOIN enhanced_tags t ON c.id = t.cluster_id
GROUP BY c.id, c.summary, c.size, c.created_at;

-- ───────────────────────────────────────────────────────────────────────
-- Functions
-- ───────────────────────────────────────────────────────────────────────

-- Function: Update cluster size
CREATE OR REPLACE FUNCTION update_cluster_size()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE clusters
        SET size = (SELECT COUNT(*) FROM enhanced_tags WHERE cluster_id = NEW.cluster_id),
            updated_at = NOW()
        WHERE id = NEW.cluster_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE clusters
        SET size = (SELECT COUNT(*) FROM enhanced_tags WHERE cluster_id = OLD.cluster_id),
            updated_at = NOW()
        WHERE id = OLD.cluster_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update cluster size
DROP TRIGGER IF EXISTS trigger_update_cluster_size ON enhanced_tags;
CREATE TRIGGER trigger_update_cluster_size
AFTER INSERT OR UPDATE OR DELETE ON enhanced_tags
FOR EACH ROW
EXECUTE FUNCTION update_cluster_size();

-- Function: Clean expired pattern cache
CREATE OR REPLACE FUNCTION clean_expired_pattern_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM pattern_search_cache
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────
-- Comments
-- ───────────────────────────────────────────────────────────────────────

COMMENT ON TABLE clusters IS 'K-means clustering results for enhanced tags';
COMMENT ON TABLE enhanced_tags IS 'Enhanced Qdrant tags with embeddings, summaries, and multi-DB references';
COMMENT ON TABLE recommendations IS 'AI-generated recommendations for code improvements';
COMMENT ON TABLE error_analysis IS 'Error analysis with AST context and fix tracking';
COMMENT ON TABLE multi_db_transactions IS 'Transaction log for multi-database operations';
COMMENT ON TABLE retry_queue IS 'Retry queue for failed database operations';
COMMENT ON TABLE file_metadata IS 'File indexing metadata for codebase tracking (renamed from file_index to avoid conflict)';
COMMENT ON TABLE pattern_search_cache IS 'Cache for ripgrep + awk pattern search results';

-- ═══════════════════════════════════════════════════════════════════════
-- Schema Creation Complete
-- ═══════════════════════════════════════════════════════════════════════
