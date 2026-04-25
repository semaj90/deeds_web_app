-- Phase 72 Topology Brain: Postgres + pgvector Schema
-- Run this in your Postgres 17 container

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: phase72_error
-- One row per unique error (file:line:column:code:message)
-- ============================================================
CREATE TABLE IF NOT EXISTS phase72_error (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_hash      TEXT NOT NULL UNIQUE,           -- sha256(file:line:col:code:msg)
    file_path       TEXT NOT NULL,
    line            INT NOT NULL,
    column          INT NOT NULL,
    code            TEXT NOT NULL,                  -- TS2304, TS2339, etc
    severity        TEXT NOT NULL DEFAULT 'error',  -- error/warning/info
    message         TEXT NOT NULL,
    phase           INT NOT NULL DEFAULT 72,
    cycle           INT NOT NULL DEFAULT 1,         -- auto-iterate cycle 1/2/3
    cluster_id      UUID,                           -- FK to phase72_cluster (nullable until clustered)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_phase72_error_file ON phase72_error(file_path);
CREATE INDEX IF NOT EXISTS idx_phase72_error_code ON phase72_error(code);
CREATE INDEX IF NOT EXISTS idx_phase72_error_cluster ON phase72_error(cluster_id);
CREATE INDEX IF NOT EXISTS idx_phase72_error_phase_cycle ON phase72_error(phase, cycle);

-- ============================================================
-- TABLE: phase72_error_vector
-- Separate table for embeddings (easier to rebuild/change dim)
-- ============================================================
CREATE TABLE IF NOT EXISTS phase72_error_vector (
    error_id        UUID PRIMARY KEY REFERENCES phase72_error(id) ON DELETE CASCADE,
    model           TEXT NOT NULL DEFAULT 'embeddinggemma:latest',
    embedding       VECTOR(768) NOT NULL,           -- Adjust if embeddinggemma uses different dim
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vector index for fast cosine similarity search in Postgres
-- (We'll use Qdrant for main search, but this gives backup option)
CREATE INDEX IF NOT EXISTS idx_phase72_error_vector_cosine
    ON phase72_error_vector
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================
-- TABLE: phase72_cluster
-- Groups of similar errors discovered via clustering
-- ============================================================
CREATE TABLE IF NOT EXISTS phase72_cluster (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label           TEXT,                           -- Human-readable label (e.g., 'TS2304 missing CardTitle')
    phase           INT NOT NULL DEFAULT 72,
    cycle           INT NOT NULL,
    size            INT NOT NULL DEFAULT 0,         -- Number of errors in cluster
    centroid        VECTOR(768),                    -- Average of all error vectors
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phase72_cluster_phase_cycle ON phase72_cluster(phase, cycle);

-- Add FK constraint for cluster_id
ALTER TABLE phase72_error
    ADD CONSTRAINT fk_phase72_error_cluster
    FOREIGN KEY (cluster_id) REFERENCES phase72_cluster(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE: phase72_cluster_summary
-- LLM-generated summaries of error clusters for RAG
-- ============================================================
CREATE TABLE IF NOT EXISTS phase72_cluster_summary (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id      UUID NOT NULL REFERENCES phase72_cluster(id) ON DELETE CASCADE,
    summary_text    TEXT NOT NULL,
    model           TEXT NOT NULL DEFAULT 'gemma3-legal:latest',
    embedding       VECTOR(768),                    -- Embedding of summary text for RAG search
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phase72_summary_cluster ON phase72_cluster_summary(cluster_id);

-- Vector index for summary search
CREATE INDEX IF NOT EXISTS idx_phase72_summary_vector_cosine
    ON phase72_cluster_summary
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- ============================================================
-- TABLE: phase72_fix_history
-- Track what fixes were applied to which errors/clusters
-- ============================================================
CREATE TABLE IF NOT EXISTS phase72_fix_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_id        UUID REFERENCES phase72_error(id) ON DELETE CASCADE,
    cluster_id      UUID REFERENCES phase72_cluster(id) ON DELETE CASCADE,
    fix_type        TEXT NOT NULL,                  -- 'ace_codemod', 'manual', 'llm_generated'
    fix_content     TEXT NOT NULL,                  -- The actual fix (code diff or description)
    model           TEXT,                           -- LLM model if applicable
    success         BOOLEAN DEFAULT NULL,           -- Did the fix work?
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phase72_fix_error ON phase72_fix_history(error_id);
CREATE INDEX IF NOT EXISTS idx_phase72_fix_cluster ON phase72_fix_history(cluster_id);

-- ============================================================
-- VIEWS: Useful queries
-- ============================================================

-- View: Errors with their vectors and cluster info
CREATE OR REPLACE VIEW v_phase72_error_complete AS
SELECT
    e.id,
    e.error_hash,
    e.file_path,
    e.line,
    e.column,
    e.code,
    e.severity,
    e.message,
    e.phase,
    e.cycle,
    e.cluster_id,
    c.label AS cluster_label,
    c.size AS cluster_size,
    v.embedding,
    v.model AS embedding_model,
    e.created_at
FROM phase72_error e
LEFT JOIN phase72_error_vector v ON e.id = v.error_id
LEFT JOIN phase72_cluster c ON e.cluster_id = c.id;

-- View: Cluster statistics
CREATE OR REPLACE VIEW v_phase72_cluster_stats AS
SELECT
    c.id AS cluster_id,
    c.label,
    c.phase,
    c.cycle,
    c.size AS declared_size,
    COUNT(e.id) AS actual_error_count,
    COUNT(DISTINCT e.file_path) AS files_affected,
    COUNT(s.id) AS summary_count,
    c.created_at
FROM phase72_cluster c
LEFT JOIN phase72_error e ON e.cluster_id = c.id
LEFT JOIN phase72_cluster_summary s ON s.cluster_id = c.id
GROUP BY c.id, c.label, c.phase, c.cycle, c.size, c.created_at;

-- View: Top error codes by frequency
CREATE OR REPLACE VIEW v_phase72_top_errors AS
SELECT
    code,
    COUNT(*) AS error_count,
    COUNT(DISTINCT file_path) AS files_affected,
    COUNT(DISTINCT cluster_id) AS clusters,
    array_agg(DISTINCT file_path ORDER BY file_path) FILTER (WHERE file_path IS NOT NULL) AS sample_files
FROM phase72_error
GROUP BY code
ORDER BY error_count DESC;

-- ============================================================
-- FUNCTIONS: Helper functions
-- ============================================================

-- Function: Find similar errors by vector
CREATE OR REPLACE FUNCTION phase72_find_similar_errors(
    query_embedding VECTOR(768),
    similarity_threshold FLOAT DEFAULT 0.85,
    max_results INT DEFAULT 10
)
RETURNS TABLE(
    error_id UUID,
    error_hash TEXT,
    file_path TEXT,
    line INT,
    code TEXT,
    message TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.error_hash,
        e.file_path,
        e.line,
        e.code,
        e.message,
        1 - (v.embedding <=> query_embedding) AS similarity
    FROM phase72_error e
    JOIN phase72_error_vector v ON e.id = v.error_id
    WHERE 1 - (v.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY v.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Function: Get cluster summary for RAG
CREATE OR REPLACE FUNCTION phase72_get_cluster_context(
    p_cluster_id UUID
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'cluster_id', c.id,
        'label', c.label,
        'size', c.size,
        'phase', c.phase,
        'cycle', c.cycle,
        'errors', (
            SELECT json_agg(json_build_object(
                'file', e.file_path,
                'line', e.line,
                'code', e.code,
                'message', e.message
            ))
            FROM phase72_error e
            WHERE e.cluster_id = c.id
            LIMIT 10
        ),
        'summaries', (
            SELECT json_agg(json_build_object(
                'text', s.summary_text,
                'model', s.model,
                'created_at', s.created_at
            ))
            FROM phase72_cluster_summary s
            WHERE s.cluster_id = c.id
        )
    ) INTO result
    FROM phase72_cluster c
    WHERE c.id = p_cluster_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: Update timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_phase72_error_updated_at
    BEFORE UPDATE ON phase72_error
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_phase72_cluster_updated_at
    BEFORE UPDATE ON phase72_cluster
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- GRANT PERMISSIONS (adjust user as needed)
-- ============================================================

-- GRANT ALL ON ALL TABLES IN SCHEMA public TO legal_admin;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO legal_admin;

-- ============================================================
-- SAMPLE QUERIES
-- ============================================================

-- Find all TS2304 errors in current cycle
-- SELECT * FROM v_phase72_error_complete WHERE code = 'TS2304' AND cycle = 1;

-- Get cluster statistics
-- SELECT * FROM v_phase72_cluster_stats ORDER BY actual_error_count DESC;

-- Find similar errors to a given embedding
-- SELECT * FROM phase72_find_similar_errors('[0.1,0.2,...]'::vector(768), 0.85, 10);

-- Get full context for a cluster (for RAG)
-- SELECT phase72_get_cluster_context('cluster-uuid-here');

-- Top error codes
-- SELECT * FROM v_phase72_top_errors LIMIT 20;
