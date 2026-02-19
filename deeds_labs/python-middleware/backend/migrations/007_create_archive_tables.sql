-- Migration: Create Archive Tables for Data Retention
-- Created: 2025-12-21
-- Purpose: Archive old error clusters (90+ days) and interaction logs (180+ days)
--          to maintain database performance while preserving historical data

-- ============================================================================
-- Error Cluster Archive Table
-- ============================================================================
-- Stores archived error clusters older than 90 days
-- Preserves all data for historical analysis and trend tracking

CREATE TABLE IF NOT EXISTS error_cluster_archive (
    id UUID PRIMARY KEY,
    route_id VARCHAR(255) NOT NULL,
    tool VARCHAR(100) NOT NULL,
    code VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL,
    count INTEGER DEFAULT 1 NOT NULL,
    file_path VARCHAR(255),
    raw_log_snippet TEXT,
    -- Enhanced columns
    cluster_id VARCHAR(255),
    error_code VARCHAR(100),
    category VARCHAR(100),
    affected_routes JSONB DEFAULT '[]'::jsonb,
    first_seen_at TIMESTAMP,
    last_seen_at TIMESTAMP,
    updated_at TIMESTAMP,
    -- Timestamps
    created_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    archived_at TIMESTAMP NOT NULL, -- When it was moved to archive
    -- Archive metadata
    archived_from_table VARCHAR(100) DEFAULT 'error_cluster',
    archive_reason VARCHAR(255) DEFAULT 'retention_policy_90_days'
);

-- Indexes for archive table (optimized for historical queries)
CREATE INDEX IF NOT EXISTS idx_error_cluster_archive_route_id ON error_cluster_archive(route_id);
CREATE INDEX IF NOT EXISTS idx_error_cluster_archive_archived_at ON error_cluster_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_error_cluster_archive_created_at ON error_cluster_archive(created_at);
CREATE INDEX IF NOT EXISTS idx_error_cluster_archive_severity ON error_cluster_archive(severity);
CREATE INDEX IF NOT EXISTS idx_error_cluster_archive_tool ON error_cluster_archive(tool);
CREATE INDEX IF NOT EXISTS idx_error_cluster_archive_cluster_id ON error_cluster_archive(cluster_id);
CREATE INDEX IF NOT EXISTS idx_error_cluster_archive_error_code ON error_cluster_archive(error_code);
CREATE INDEX IF NOT EXISTS idx_error_cluster_archive_category ON error_cluster_archive(category);

-- ============================================================================
-- Route Interaction Log Archive Table
-- ============================================================================
-- Stores archived interaction logs older than 180 days
-- Preserves user behavior data for long-term analytics

CREATE TABLE IF NOT EXISTS route_interaction_log_archive (
    id UUID PRIMARY KEY,
    route_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    interaction_type VARCHAR(50) NOT NULL,
    metadata JSONB,
    -- Enhanced columns
    session_id VARCHAR(255),
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    -- Timestamps
    created_at TIMESTAMP NOT NULL,
    archived_at TIMESTAMP NOT NULL, -- When it was moved to archive
    -- Archive metadata
    archived_from_table VARCHAR(100) DEFAULT 'route_interaction_log',
    archive_reason VARCHAR(255) DEFAULT 'retention_policy_180_days'
);

-- Indexes for archive table (optimized for analytics queries)
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_archive_route_id ON route_interaction_log_archive(route_id);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_archive_user_id ON route_interaction_log_archive(user_id);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_archive_archived_at ON route_interaction_log_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_archive_created_at ON route_interaction_log_archive(created_at);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_archive_interaction_type ON route_interaction_log_archive(interaction_type);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_archive_session_id ON route_interaction_log_archive(session_id);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_archive_success ON route_interaction_log_archive(success);

-- ============================================================================
-- Archive Statistics View
-- ============================================================================
-- Provides quick overview of archived data for monitoring

CREATE OR REPLACE VIEW archive_statistics AS
SELECT
    'error_cluster' AS table_name,
    COUNT(*) AS total_records,
    MIN(archived_at) AS oldest_archive,
    MAX(archived_at) AS newest_archive,
    COUNT(DISTINCT route_id) AS unique_routes,
    pg_size_pretty(pg_total_relation_size('error_cluster_archive')) AS table_size
FROM error_cluster_archive
UNION ALL
SELECT
    'route_interaction_log' AS table_name,
    COUNT(*) AS total_records,
    MIN(archived_at) AS oldest_archive,
    MAX(archived_at) AS newest_archive,
    COUNT(DISTINCT route_id) AS unique_routes,
    pg_size_pretty(pg_total_relation_size('route_interaction_log_archive')) AS table_size
FROM route_interaction_log_archive;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE error_cluster_archive IS 'Archive table for error clusters older than 90 days. Preserves historical error data for trend analysis.';
COMMENT ON TABLE route_interaction_log_archive IS 'Archive table for interaction logs older than 180 days. Preserves user behavior data for long-term analytics.';
COMMENT ON VIEW archive_statistics IS 'Provides overview of archived data including record counts, date ranges, and storage size.';

-- ============================================================================
-- Grant Permissions
-- ============================================================================

-- Grant read/write access to archive tables
GRANT SELECT, INSERT ON error_cluster_archive TO legal_admin;
GRANT SELECT, INSERT ON route_interaction_log_archive TO legal_admin;
GRANT SELECT ON archive_statistics TO legal_admin;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 007: Archive tables created successfully';
    RAISE NOTICE '  - error_cluster_archive: Ready for 90-day retention';
    RAISE NOTICE '  - route_interaction_log_archive: Ready for 180-day retention';
    RAISE NOTICE '  - archive_statistics view: Available for monitoring';
END $$;
