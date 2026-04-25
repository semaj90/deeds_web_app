-- Phase 72 Topology Brain - Canonical Schema for legal_ai_db
-- PostgreSQL 17 + pgvector
-- Column names: line, column, code (NOT line_num, column_num, error_code)

-- Enable extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Phase 72 Error Topology Tables
-- ============================================================================

-- Raw errors captured by Phase 72 fast scan
CREATE TABLE IF NOT EXISTS phase72_error (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_hash      TEXT NOT NULL UNIQUE,
    file_path       TEXT NOT NULL,
    line            INTEGER NOT NULL,
    "column"        INTEGER NOT NULL,           -- quoted because COLUMN is reserved
    code            TEXT NOT NULL,              -- e.g. TS2304
    severity        TEXT NOT NULL DEFAULT 'error',
    message         TEXT NOT NULL,
    phase           INTEGER NOT NULL DEFAULT 72,
    cycle           INTEGER NOT NULL,           -- 1, 2, 3 (auto-iterate)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Embedding for each error (from embeddinggemma:latest)
CREATE TABLE IF NOT EXISTS phase72_error_vector (
    error_id        UUID PRIMARY KEY REFERENCES phase72_error(id) ON DELETE CASCADE,
    model           TEXT NOT NULL DEFAULT 'embeddinggemma:latest',
    embedding       VECTOR(768) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cluster (after WebGPU SOM / Qdrant clustering)
CREATE TABLE IF NOT EXISTS phase72_cluster (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label           TEXT,
    phase           INTEGER NOT NULL DEFAULT 72,
    cycle           INTEGER NOT NULL,
    size            INTEGER NOT NULL DEFAULT 0,
    centroid        VECTOR(768),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Summary per cluster (from gemma3-legal:latest)
CREATE TABLE IF NOT EXISTS phase72_cluster_summary (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id      UUID NOT NULL REFERENCES phase72_cluster(id) ON DELETE CASCADE,
    summary_text    TEXT NOT NULL,
    model           TEXT NOT NULL DEFAULT 'gemma3-legal:latest',
    embedding       VECTOR(768),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes (separated from CREATE TABLE for PostgreSQL compatibility)
-- ============================================================================

-- Error table indexes
CREATE INDEX IF NOT EXISTS idx_phase72_error_hash
    ON phase72_error(error_hash);

CREATE INDEX IF NOT EXISTS idx_phase72_error_file
    ON phase72_error(file_path);

CREATE INDEX IF NOT EXISTS idx_phase72_error_code
    ON phase72_error(code);

CREATE INDEX IF NOT EXISTS idx_phase72_error_phase_cycle
    ON phase72_error(phase, cycle);

CREATE INDEX IF NOT EXISTS idx_phase72_error_file_line_col
    ON phase72_error(file_path, line, "column");

CREATE INDEX IF NOT EXISTS idx_phase72_error_code_severity
    ON phase72_error(code, severity);

-- Vector similarity index (IVFFlat for fast approximate search)
-- Note: This index requires data to exist first, so it may need to be created after initial data load
-- CREATE INDEX IF NOT EXISTS idx_phase72_error_vector_ivf
--     ON phase72_error_vector
--     USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);

-- Cluster table indexes
CREATE INDEX IF NOT EXISTS idx_phase72_cluster_phase_cycle
    ON phase72_cluster(phase, cycle);

CREATE INDEX IF NOT EXISTS idx_phase72_cluster_label
    ON phase72_cluster(label);

-- Cluster summary indexes
CREATE INDEX IF NOT EXISTS idx_phase72_cluster_summary_cluster
    ON phase72_cluster_summary(cluster_id);

-- ============================================================================
-- Views for common queries
-- ============================================================================

-- Errors with their vectors
CREATE OR REPLACE VIEW phase72_error_with_vector AS
SELECT
    e.id,
    e.error_hash,
    e.file_path,
    e.line,
    e."column",
    e.code,
    e.severity,
    e.message,
    e.phase,
    e.cycle,
    ev.embedding,
    ev.model as embedding_model,
    e.created_at,
    e.updated_at
FROM phase72_error e
LEFT JOIN phase72_error_vector ev ON e.id = ev.error_id;

-- Clusters with their summaries
CREATE OR REPLACE VIEW phase72_cluster_with_summary AS
SELECT
    c.id,
    c.label,
    c.phase,
    c.cycle,
    c.size,
    c.centroid,
    cs.summary_text,
    cs.model as summary_model,
    c.created_at,
    c.updated_at
FROM phase72_cluster c
LEFT JOIN phase72_cluster_summary cs ON c.id = cs.cluster_id;

-- Error count by code (useful for dashboard)
CREATE OR REPLACE VIEW phase72_error_summary AS
SELECT
    code,
    severity,
    COUNT(*) as error_count,
    COUNT(DISTINCT file_path) as affected_files,
    MAX(created_at) as last_seen
FROM phase72_error
GROUP BY code, severity
ORDER BY error_count DESC;

-- ============================================================================
-- Utility functions
-- ============================================================================

-- Function to get similar errors by vector
CREATE OR REPLACE FUNCTION phase72_find_similar_errors(
    target_hash TEXT,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    error_hash TEXT,
    code TEXT,
    message TEXT,
    file_path TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.error_hash,
        e.code,
        e.message,
        e.file_path,
        1 - (ev.embedding <=> target_ev.embedding) as similarity
    FROM phase72_error e
    JOIN phase72_error_vector ev ON e.id = ev.error_id
    CROSS JOIN (
        SELECT embedding
        FROM phase72_error_vector
        WHERE error_id = (SELECT id FROM phase72_error WHERE error_hash = target_hash)
    ) target_ev
    WHERE e.error_hash != target_hash
    ORDER BY ev.embedding <=> target_ev.embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Success message
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Phase 72 Topology Brain schema loaded successfully!';
    RAISE NOTICE 'Tables: phase72_error, phase72_error_vector, phase72_cluster, phase72_cluster_summary';
    RAISE NOTICE 'Views: phase72_error_with_vector, phase72_cluster_with_summary, phase72_error_summary';
    RAISE NOTICE 'Column names: line, column, code (NOT line_num, column_num, error_code)';
END $$;
