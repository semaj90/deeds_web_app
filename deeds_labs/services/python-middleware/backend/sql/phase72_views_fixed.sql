-- Phase 72 Views Fix
-- Recreates views with correct column names (col instead of column)
-- Run this after updating phase72_topology_schema.sql

-- 1) Index using correct column name
CREATE INDEX IF NOT EXISTS idx_phase72_error_line_col
ON phase72_error (file_path, line, col);

-- 2) View: Error with vector embeddings
DROP VIEW IF EXISTS phase72_error_with_vector CASCADE;
CREATE VIEW phase72_error_with_vector AS
SELECT
    e.id,
    e.error_hash,
    e.file_path,
    e.line,
    e.col AS "column",          -- expose legacy name for tools
    e.code,
    e.severity,
    e.message,
    e.phase,
    e.cycle,
    e.created_at,
    v.model,
    v.embedding,
    v.created_at AS embedding_created_at
FROM phase72_error e
LEFT JOIN phase72_error_vector v ON v.error_id = e.id;

-- 3) View: Cluster with summary
DROP VIEW IF EXISTS phase72_cluster_with_summary CASCADE;
CREATE VIEW phase72_cluster_with_summary AS
SELECT
    c.id,
    c.label,
    c.phase,
    c.cycle,
    c.size,
    c.centroid,
    c.created_at AS updated_at,   -- old code expected updated_at
    s.summary_text,
    s.model,
    s.embedding AS summary_embedding,
    s.created_at AS summary_created_at
FROM phase72_cluster c
LEFT JOIN phase72_cluster_summary s ON s.cluster_id = c.id;

-- 4) View: Error summary by code
DROP VIEW IF EXISTS phase72_error_summary CASCADE;
CREATE VIEW phase72_error_summary AS
SELECT
    e.code,
    COUNT(*)              AS error_count,
    MIN(e.created_at)     AS first_seen,
    MAX(e.created_at)     AS last_seen
FROM phase72_error e
GROUP BY e.code
ORDER BY error_count DESC;

-- 5) View: Errors by route/file
DROP VIEW IF EXISTS phase72_route_errors CASCADE;
CREATE VIEW phase72_route_errors AS
SELECT
    file_path,
    COUNT(*)        AS error_count,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
FROM phase72_error
GROUP BY file_path
ORDER BY error_count DESC;

-- 6) View: Cluster quality
DROP VIEW IF EXISTS phase72_cluster_quality CASCADE;
CREATE VIEW phase72_cluster_quality AS
SELECT
    c.id,
    c.label,
    c.size,
    c.cycle,
    c.created_at,
    (cs.id IS NOT NULL) AS has_summary
FROM phase72_cluster c
LEFT JOIN phase72_cluster_summary cs ON cs.cluster_id = c.id;
