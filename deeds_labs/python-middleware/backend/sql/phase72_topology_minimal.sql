-- Phase 72.5: Topology Datastore Schema
-- Postgres 17 + pgvector
-- Minimal schema for error topology

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- Phase 72 Error Topology
-- ============================================================================

-- Raw errors captured by Phase 72 fast scan
CREATE TABLE IF NOT EXISTS phase72_error (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_hash      TEXT NOT NULL UNIQUE,
    file_path       TEXT NOT NULL,
    line            INT NOT NULL,
    column          INT NOT NULL,
    code            TEXT NOT NULL,              -- e.g. TS2304
    severity        TEXT NOT NULL DEFAULT 'error',  -- 'error' | 'warning'
    message         TEXT NOT NULL,
    phase           INT NOT NULL DEFAULT 72,
    cycle           INT NOT NULL,               -- 1, 2, 3 (auto-iterate)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    INDEX idx_phase72_error_hash (error_hash),
    INDEX idx_phase72_error_file (file_path),
    INDEX idx_phase72_error_code (code),
    INDEX idx_phase72_error_phase_cycle (phase, cycle)
);

-- Embedding for each error (from embeddinggemma:latest)
CREATE TABLE IF NOT EXISTS phase72_error_vector (
    error_id    UUID PRIMARY KEY REFERENCES phase72_error(id) ON DELETE CASCADE,
    model       TEXT NOT NULL DEFAULT 'embeddinggemma:latest',
    embedding   vector(768) NOT NULL,          -- 768-dim from embeddinggemma
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    INDEX idx_phase72_error_vector_embedding USING ivfflat (embedding vector_cosine_ops)
);

-- Cluster (after WebGPU SOM / Qdrant clustering)
CREATE TABLE IF NOT EXISTS phase72_cluster (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label       TEXT,                          -- e.g. 'TS2304 missing identifier'
    phase       INT NOT NULL DEFAULT 72,
    cycle       INT NOT NULL,                  -- 1, 2, 3
    size        INT NOT NULL DEFAULT 0,
    centroid    vector(768),                   -- optional centroid
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    INDEX idx_phase72_cluster_phase_cycle (phase, cycle),
    INDEX idx_phase72_cluster_label (label)
);

-- Summary per cluster (from gemma3-legal:latest)
CREATE TABLE IF NOT EXISTS phase72_cluster_summary (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id      UUID NOT NULL REFERENCES phase72_cluster(id) ON DELETE CASCADE,
    summary_text    TEXT NOT NULL,
    model           TEXT NOT NULL DEFAULT 'gemma3-legal:latest',
    embedding       vector(768),                -- re-embedded via embeddinggemma
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    INDEX idx_phase72_cluster_summary_cluster (cluster_id),
    INDEX idx_phase72_cluster_summary_embedding USING ivfflat (embedding vector_cosine_ops)
);

-- ============================================================================
-- Indexes for common queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_phase72_error_file_line_col
    ON phase72_error(file_path, line, column);

CREATE INDEX IF NOT EXISTS idx_phase72_error_code_severity
    ON phase72_error(code, severity);

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
    e.column,
    e.code,
    e.severity,
    e.message,
    e.phase,
    e.cycle,
    ev.embedding,
    ev.model as embedding_model,
    e.created_at
FROM phase72_error e
LEFT JOIN phase72_error_vector ev ON e.id = ev.error_id;

-- Top error codes by frequency
CREATE OR REPLACE VIEW phase72_top_error_codes AS
SELECT
    code,
    COUNT(*) as count,
    COUNT(DISTINCT file_path) as files_affected,
    phase,
    cycle
FROM phase72_error
GROUP BY code, phase, cycle
ORDER BY count DESC;
