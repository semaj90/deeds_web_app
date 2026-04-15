-- Route Health Tables Migration
-- Adds route monitoring tables defined in src/lib/db/schema/route-health-tables.ts
-- These tables are outside the main drizzle.config.ts schema path and must be applied manually.
-- Run: psql $DATABASE_URL -f drizzle/manual/20260413_route_health_tables.sql

-- ============================================================
-- 1. route_metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS route_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id VARCHAR(255) UNIQUE NOT NULL,
    path VARCHAR(255) NOT NULL,
    kind VARCHAR(50) NOT NULL,
    "group" VARCHAR(100),
    status VARCHAR(50) DEFAULT 'healthy',
    priority INTEGER DEFAULT 50,
    badges JSONB DEFAULT '[]',
    description TEXT,
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    health_score INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_route_metadata_route_id ON route_metadata (route_id);
CREATE INDEX IF NOT EXISTS idx_route_metadata_status ON route_metadata (status);
CREATE INDEX IF NOT EXISTS idx_route_metadata_archived_at ON route_metadata (archived_at);
CREATE INDEX IF NOT EXISTS idx_route_metadata_tags ON route_metadata USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_route_metadata_metadata ON route_metadata USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_route_metadata_last_accessed_at ON route_metadata (last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_route_metadata_health_score ON route_metadata (health_score);
CREATE INDEX IF NOT EXISTS idx_route_metadata_error_count ON route_metadata (error_count);

-- ============================================================
-- 2. error_cluster
-- ============================================================
CREATE TABLE IF NOT EXISTS error_cluster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id) ON DELETE CASCADE,
    tool VARCHAR(100) NOT NULL,
    code VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    file_path VARCHAR(255),
    raw_log_snippet TEXT,
    title VARCHAR(255),
    cluster_id VARCHAR(255),
    error_code VARCHAR(100),
    category VARCHAR(100),
    affected_routes JSONB DEFAULT '[]',
    first_seen_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_error_cluster_route_id ON error_cluster (route_id);
CREATE INDEX IF NOT EXISTS idx_error_cluster_severity ON error_cluster (severity);
CREATE INDEX IF NOT EXISTS idx_error_cluster_created_at ON error_cluster (created_at);
CREATE INDEX IF NOT EXISTS idx_error_cluster_resolved_at ON error_cluster (resolved_at);
CREATE INDEX IF NOT EXISTS idx_error_cluster_tool ON error_cluster (tool);
CREATE INDEX IF NOT EXISTS idx_error_cluster_cluster_id ON error_cluster (cluster_id);
CREATE INDEX IF NOT EXISTS idx_error_cluster_error_code ON error_cluster (error_code);
CREATE INDEX IF NOT EXISTS idx_error_cluster_category ON error_cluster (category);
CREATE INDEX IF NOT EXISTS idx_error_cluster_first_seen_at ON error_cluster (first_seen_at);
CREATE INDEX IF NOT EXISTS idx_error_cluster_last_seen_at ON error_cluster (last_seen_at);
CREATE INDEX IF NOT EXISTS idx_error_cluster_updated_at ON error_cluster (updated_at);

-- ============================================================
-- 3. route_health_event
-- ============================================================
CREATE TABLE IF NOT EXISTS route_health_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    reason VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    triggered_by VARCHAR(255),
    error_count INTEGER DEFAULT 0,
    health_score INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_health_event_route_id ON route_health_event (route_id);
CREATE INDEX IF NOT EXISTS idx_route_health_event_created_at ON route_health_event (created_at);
CREATE INDEX IF NOT EXISTS idx_route_health_event_triggered_by ON route_health_event (triggered_by);
CREATE INDEX IF NOT EXISTS idx_route_health_event_metadata ON route_health_event USING GIN (metadata);

-- ============================================================
-- 4. error_brain_analysis
-- ============================================================
CREATE TABLE IF NOT EXISTS error_brain_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id) ON DELETE CASCADE,
    suggestions JSONB NOT NULL,
    selected_suggestion_index INTEGER,
    phase VARCHAR(50),
    error_message TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    model_version VARCHAR(100),
    confidence_score DECIMAL(5,2),
    execution_time_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_error_brain_analysis_route_id ON error_brain_analysis (route_id);
CREATE INDEX IF NOT EXISTS idx_error_brain_analysis_created_at ON error_brain_analysis (created_at);
CREATE INDEX IF NOT EXISTS idx_error_brain_analysis_status ON error_brain_analysis (status);
CREATE INDEX IF NOT EXISTS idx_error_brain_analysis_model_version ON error_brain_analysis (model_version);
CREATE INDEX IF NOT EXISTS idx_error_brain_analysis_confidence_score ON error_brain_analysis (confidence_score);
CREATE INDEX IF NOT EXISTS idx_error_brain_analysis_updated_at ON error_brain_analysis (updated_at);

-- ============================================================
-- 5. error_brain_patch
-- ============================================================
CREATE TABLE IF NOT EXISTS error_brain_patch (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES error_brain_analysis(id) ON DELETE CASCADE,
    route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id) ON DELETE CASCADE,
    patch_content TEXT NOT NULL,
    applied_at TIMESTAMPTZ,
    verification_status VARCHAR(50),
    verification_timestamp TIMESTAMPTZ,
    verification_message TEXT,
    patch_type VARCHAR(50) DEFAULT 'code_fix',
    file_path VARCHAR(500),
    line_start INTEGER,
    line_end INTEGER,
    confidence_score DECIMAL(5,2),
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_brain_patch_analysis_id ON error_brain_patch (analysis_id);
CREATE INDEX IF NOT EXISTS idx_error_brain_patch_route_id ON error_brain_patch (route_id);
CREATE INDEX IF NOT EXISTS idx_error_brain_patch_verification_status ON error_brain_patch (verification_status);
CREATE INDEX IF NOT EXISTS idx_error_brain_patch_patch_type ON error_brain_patch (patch_type);
CREATE INDEX IF NOT EXISTS idx_error_brain_patch_file_path ON error_brain_patch (file_path);
CREATE INDEX IF NOT EXISTS idx_error_brain_patch_confidence_score ON error_brain_patch (confidence_score);
CREATE INDEX IF NOT EXISTS idx_error_brain_patch_updated_at ON error_brain_patch (updated_at);

-- ============================================================
-- 6. route_interaction_log
-- ============================================================
CREATE TABLE IF NOT EXISTS route_interaction_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id) ON DELETE CASCADE,
    user_id VARCHAR(255),
    interaction_type VARCHAR(50) NOT NULL,
    metadata JSONB,
    session_id VARCHAR(255),
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_interaction_log_route_id ON route_interaction_log (route_id);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_user_id ON route_interaction_log (user_id);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_created_at ON route_interaction_log (created_at);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_session_id ON route_interaction_log (session_id);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_success ON route_interaction_log (success);
CREATE INDEX IF NOT EXISTS idx_route_interaction_log_ip_address ON route_interaction_log (ip_address);
