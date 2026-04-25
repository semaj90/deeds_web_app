-- Phase 72–78 Error Brain Schema for legal_ai_db
-- Created: December 2, 2025

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

------------------------------------------------------------
-- Core Errors Table
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phase72_error (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_hash TEXT NOT NULL UNIQUE,
    file_path  TEXT NOT NULL,
    line       INT  NOT NULL,
    col        INT  NOT NULL,
    code       TEXT NOT NULL,
    severity   TEXT NOT NULL,
    message    TEXT NOT NULL,
    phase      INT  NOT NULL DEFAULT 72,
    cycle      INT  NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- Embeddings Table (768-dim embeddinggemma vectors)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phase72_error_vector (
    error_id   UUID PRIMARY KEY REFERENCES phase72_error(id) ON DELETE CASCADE,
    model      TEXT NOT NULL,
    embedding  VECTOR(768) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- Clusters (Phase 73)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phase72_cluster (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label      TEXT,
    phase      INT NOT NULL DEFAULT 72,
    cycle      INT NOT NULL,
    size       INT NOT NULL DEFAULT 0,
    centroid   VECTOR(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- Cluster Summaries (Phase 73/78)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phase72_cluster_summary (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id    UUID NOT NULL REFERENCES phase72_cluster(id) ON DELETE CASCADE,
    summary_text  TEXT NOT NULL,
    model         TEXT NOT NULL,
    embedding     VECTOR(768),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- Indexes
------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_phase72_error_hash
ON phase72_error(error_hash);

CREATE INDEX IF NOT EXISTS idx_phase72_error_file
ON phase72_error(file_path);

CREATE INDEX IF NOT EXISTS idx_phase72_error_code
ON phase72_error(code);

CREATE INDEX IF NOT EXISTS idx_phase72_error_created
ON phase72_error(created_at);

CREATE INDEX IF NOT EXISTS idx_phase72_vector_ivf
ON phase72_error_vector
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

------------------------------------------------------------
-- Helpful Views
------------------------------------------------------------

-- Error counts by code
CREATE OR REPLACE VIEW phase72_error_stats AS
SELECT
    code,
    severity,
    COUNT(*)            AS count,
    MIN(created_at)     AS first_seen,
    MAX(created_at)     AS last_seen
FROM phase72_error
GROUP BY code, severity
ORDER BY count DESC;

-- Error counts by route/file
CREATE OR REPLACE VIEW phase72_route_errors AS
SELECT
    file_path,
    COUNT(*)        AS error_count,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
FROM phase72_error
GROUP BY file_path
ORDER BY error_count DESC;

-- Cluster "quality" – just size + summary presence
CREATE OR REPLACE VIEW phase72_cluster_quality AS
SELECT
    c.id,
    c.label,
    c.size,
    c.cycle,
    c.created_at,
    (cs.id IS NOT NULL) AS has_summary
FROM phase72_cluster c
LEFT JOIN phase72_cluster_summary cs ON cs.cluster_id = c.id;
