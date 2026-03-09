/**
 * Horizontal Agent Scaling Database Schema with JSONB
 * 
 * Production-ready schema for storing horizontal scaling data using JSONB
 * for flexible metadata and configuration storage.
 * 
 * Features:
 * - Agent placement and deployment tracking
 * - Server node registration and health
 * - Scaling policies and metrics
 * - Load balancing configuration
 * - Service discovery data
 * - Distributed coordination state
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =====================================
-- SERVER NODES AND SERVICE REGISTRY
-- =====================================

-- Server nodes in the scaling cluster
CREATE TABLE IF NOT EXISTS server_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id VARCHAR(255) UNIQUE NOT NULL,
    server_address VARCHAR(255) NOT NULL,
    
    -- Server status and health
    status VARCHAR(50) DEFAULT 'unknown',
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Server capabilities and resources
    capabilities JSONB NOT NULL DEFAULT '[]',
    resources JSONB NOT NULL DEFAULT '{}',
    
    -- Server metadata
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Performance metrics
    performance_metrics JSONB NOT NULL DEFAULT '{}',
    
    -- Health tracking
    health_status JSONB NOT NULL DEFAULT '{}',
    
    -- Timestamps
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Geographic and network info
    region VARCHAR(100),
    zone VARCHAR(100),
    network_latency INTEGER DEFAULT 0,
    
    -- Version and compatibility
    node_version VARCHAR(50) DEFAULT '1.0.0',
    compatibility_matrix JSONB DEFAULT '{}'
);

-- =====================================
-- AGENT PLACEMENTS AND DEPLOYMENTS
-- =====================================

-- Agent placements across servers
CREATE TABLE IF NOT EXISTS agent_placements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(255) UNIQUE NOT NULL,
    agent_type VARCHAR(100) NOT NULL,
    
    -- Placement details
    server_id VARCHAR(255) REFERENCES server_nodes(server_id),
    server_address VARCHAR(255),
    
    -- Agent status
    status VARCHAR(50) DEFAULT 'pending',
    health_status VARCHAR(50) DEFAULT 'unknown',
    
    -- Resource allocation
    allocated_resources JSONB NOT NULL DEFAULT '{}',
    resource_usage JSONB NOT NULL DEFAULT '{}',
    
    -- Configuration and metadata
    configuration JSONB NOT NULL DEFAULT '{}',
    environment_variables JSONB DEFAULT '{}',
    
    -- Deployment information
    deployment_metadata JSONB NOT NULL DEFAULT '{}',
    deployment_type VARCHAR(50) DEFAULT 'auto',
    
    -- Performance metrics
    performance_metrics JSONB NOT NULL DEFAULT '{}',
    
    -- Migration and lifecycle
    migrated_from VARCHAR(255),
    migration_metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deployed_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    stopped_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error tracking
    error_log JSONB DEFAULT '[]',
    failure_count INTEGER DEFAULT 0,
    
    -- Version and compatibility
    agent_version VARCHAR(50) DEFAULT '1.0.0',
    runtime_info JSONB DEFAULT '{}'
);

-- =====================================
-- SCALING POLICIES AND RULES
-- =====================================

-- Scaling policies for different agent types
CREATE TABLE IF NOT EXISTS scaling_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id VARCHAR(255) UNIQUE NOT NULL,
    agent_type VARCHAR(100) NOT NULL,
    
    -- Policy configuration
    policy_config JSONB NOT NULL DEFAULT '{}',
    
    -- Scaling parameters
    min_instances INTEGER DEFAULT 1,
    max_instances INTEGER DEFAULT 10,
    scale_up_threshold DECIMAL(5,4) DEFAULT 0.8,
    scale_down_threshold DECIMAL(5,4) DEFAULT 0.3,
    
    -- Timing configuration
    scale_up_cooldown INTEGER DEFAULT 60000,
    scale_down_cooldown INTEGER DEFAULT 300000,
    evaluation_interval INTEGER DEFAULT 30000,
    
    -- Metrics and triggers
    scaling_metrics JSONB NOT NULL DEFAULT '[]',
    trigger_conditions JSONB NOT NULL DEFAULT '{}',
    
    -- Advanced configuration
    placement_strategy VARCHAR(100) DEFAULT 'resource-aware',
    load_balancing_config JSONB DEFAULT '{}',
    
    -- Policy metadata
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Status and control
    enabled BOOLEAN DEFAULT true,
    last_evaluation TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Versioning
    version INTEGER DEFAULT 1,
    change_log JSONB DEFAULT '[]'
);

-- =====================================
-- SCALING OPERATIONS AND METRICS
-- =====================================

-- Record of scaling operations and their results
CREATE TABLE IF NOT EXISTS scaling_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Operation details
    agent_type VARCHAR(100) NOT NULL,
    operation_type VARCHAR(50) NOT NULL, -- 'scale-up', 'scale-down', 'migrate'
    
    -- Scaling parameters
    previous_count INTEGER NOT NULL,
    target_count INTEGER NOT NULL,
    actual_count INTEGER,
    
    -- Operation status
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Detailed actions taken
    scaling_actions JSONB NOT NULL DEFAULT '[]',
    
    -- Metrics and performance
    operation_metrics JSONB NOT NULL DEFAULT '{}',
    scaling_time_ms INTEGER,
    
    -- Trigger information
    triggered_by VARCHAR(100),
    trigger_metrics JSONB DEFAULT '{}',
    trigger_reason TEXT,
    
    -- Results and impact
    operation_result JSONB NOT NULL DEFAULT '{}',
    impact_analysis JSONB DEFAULT '{}',
    
    -- Error tracking
    errors JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Associated policy
    policy_id VARCHAR(255),
    
    -- Coordination info
    coordinator_id VARCHAR(255),
    distributed_lock_id VARCHAR(255)
);

-- =====================================
-- LOAD BALANCING AND SERVICE DISCOVERY
-- =====================================

-- Load balancing configuration and state
CREATE TABLE IF NOT EXISTS load_balancing_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_type VARCHAR(100) NOT NULL,
    
    -- Load balancing configuration
    strategy VARCHAR(100) DEFAULT 'round-robin',
    configuration JSONB NOT NULL DEFAULT '{}',
    
    -- Active agents and their weights
    active_agents JSONB NOT NULL DEFAULT '[]',
    agent_weights JSONB DEFAULT '{}',
    
    -- Routing state
    routing_state JSONB NOT NULL DEFAULT '{}',
    round_robin_counters JSONB DEFAULT '{}',
    
    -- Health check configuration
    health_check_config JSONB DEFAULT '{}',
    
    -- Performance metrics
    routing_metrics JSONB NOT NULL DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Version
    version INTEGER DEFAULT 1,
    
    UNIQUE(agent_type)
);

-- Service discovery registry
CREATE TABLE IF NOT EXISTS service_discovery (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id VARCHAR(255) UNIQUE NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    
    -- Service endpoint information
    endpoint_data JSONB NOT NULL DEFAULT '{}',
    
    -- Service metadata
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Health and status
    health_status VARCHAR(50) DEFAULT 'unknown',
    last_health_check TIMESTAMP WITH TIME ZONE,
    
    -- Discovery configuration
    discovery_config JSONB DEFAULT '{}',
    
    -- Timestamps
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Tags for filtering
    tags JSONB DEFAULT '[]',
    
    -- Version
    version VARCHAR(50) DEFAULT '1.0.0'
);

-- =====================================
-- DISTRIBUTED COORDINATION
-- =====================================

-- Distributed locks for coordination
CREATE TABLE IF NOT EXISTS distributed_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lock_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Lock details
    resource VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    
    -- Lock metadata
    lock_metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Timing
    acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    
    -- Coordination info
    coordination_data JSONB DEFAULT '{}'
);

-- Leader election state
CREATE TABLE IF NOT EXISTS leader_election (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_key VARCHAR(255) UNIQUE NOT NULL,
    
    -- Leader information
    current_leader VARCHAR(255),
    leader_metadata JSONB DEFAULT '{}',
    
    -- Election details
    election_data JSONB NOT NULL DEFAULT '{}',
    
    -- Timing
    elected_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Candidates
    candidates JSONB DEFAULT '[]',
    
    -- Election history
    election_history JSONB DEFAULT '[]',
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- PERFORMANCE AND ANALYTICS
-- =====================================

-- System-wide scaling metrics and analytics
CREATE TABLE IF NOT EXISTS scaling_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Time window for metrics
    time_window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    time_window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Aggregated metrics
    system_metrics JSONB NOT NULL DEFAULT '{}',
    
    -- Agent type specific metrics
    agent_type_metrics JSONB NOT NULL DEFAULT '{}',
    
    -- Server performance metrics
    server_metrics JSONB NOT NULL DEFAULT '{}',
    
    -- Scaling operation summary
    scaling_summary JSONB NOT NULL DEFAULT '{}',
    
    -- Resource utilization
    resource_utilization JSONB NOT NULL DEFAULT '{}',
    
    -- Performance insights
    performance_insights JSONB DEFAULT '{}',
    
    -- Alerts and recommendations
    alerts JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Data source
    data_source VARCHAR(100) DEFAULT 'scaling-system'
);

-- =====================================
-- INDEXES FOR OPTIMAL PERFORMANCE
-- =====================================

-- Server nodes indexes
CREATE INDEX IF NOT EXISTS idx_server_nodes_server_id ON server_nodes(server_id);
CREATE INDEX IF NOT EXISTS idx_server_nodes_status ON server_nodes(status);
CREATE INDEX IF NOT EXISTS idx_server_nodes_capabilities_gin ON server_nodes USING GIN (capabilities);
CREATE INDEX IF NOT EXISTS idx_server_nodes_resources_gin ON server_nodes USING GIN (resources);
CREATE INDEX IF NOT EXISTS idx_server_nodes_metadata_gin ON server_nodes USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_server_nodes_last_heartbeat ON server_nodes(last_heartbeat);

-- Agent placements indexes
CREATE INDEX IF NOT EXISTS idx_agent_placements_agent_id ON agent_placements(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_placements_agent_type ON agent_placements(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_placements_server_id ON agent_placements(server_id);
CREATE INDEX IF NOT EXISTS idx_agent_placements_status ON agent_placements(status);
CREATE INDEX IF NOT EXISTS idx_agent_placements_type_status ON agent_placements(agent_type, status);
CREATE INDEX IF NOT EXISTS idx_agent_placements_config_gin ON agent_placements USING GIN (configuration);
CREATE INDEX IF NOT EXISTS idx_agent_placements_resources_gin ON agent_placements USING GIN (allocated_resources);
CREATE INDEX IF NOT EXISTS idx_agent_placements_metrics_gin ON agent_placements USING GIN (performance_metrics);
CREATE INDEX IF NOT EXISTS idx_agent_placements_created_at ON agent_placements(created_at);

-- Scaling policies indexes
CREATE INDEX IF NOT EXISTS idx_scaling_policies_policy_id ON scaling_policies(policy_id);
CREATE INDEX IF NOT EXISTS idx_scaling_policies_agent_type ON scaling_policies(agent_type);
CREATE INDEX IF NOT EXISTS idx_scaling_policies_enabled ON scaling_policies(enabled);
CREATE INDEX IF NOT EXISTS idx_scaling_policies_config_gin ON scaling_policies USING GIN (policy_config);
CREATE INDEX IF NOT EXISTS idx_scaling_policies_metrics_gin ON scaling_policies USING GIN (scaling_metrics);

-- Scaling operations indexes
CREATE INDEX IF NOT EXISTS idx_scaling_operations_operation_id ON scaling_operations(operation_id);
CREATE INDEX IF NOT EXISTS idx_scaling_operations_agent_type ON scaling_operations(agent_type);
CREATE INDEX IF NOT EXISTS idx_scaling_operations_type ON scaling_operations(operation_type);
CREATE INDEX IF NOT EXISTS idx_scaling_operations_status ON scaling_operations(status);
CREATE INDEX IF NOT EXISTS idx_scaling_operations_started_at ON scaling_operations(started_at);
CREATE INDEX IF NOT EXISTS idx_scaling_operations_actions_gin ON scaling_operations USING GIN (scaling_actions);
CREATE INDEX IF NOT EXISTS idx_scaling_operations_metrics_gin ON scaling_operations USING GIN (operation_metrics);

-- Load balancing indexes
CREATE INDEX IF NOT EXISTS idx_load_balancing_agent_type ON load_balancing_state(agent_type);
CREATE INDEX IF NOT EXISTS idx_load_balancing_updated_at ON load_balancing_state(updated_at);
CREATE INDEX IF NOT EXISTS idx_load_balancing_config_gin ON load_balancing_state USING GIN (configuration);
CREATE INDEX IF NOT EXISTS idx_load_balancing_agents_gin ON load_balancing_state USING GIN (active_agents);

-- Service discovery indexes
CREATE INDEX IF NOT EXISTS idx_service_discovery_service_id ON service_discovery(service_id);
CREATE INDEX IF NOT EXISTS idx_service_discovery_service_name ON service_discovery(service_name);
CREATE INDEX IF NOT EXISTS idx_service_discovery_service_type ON service_discovery(service_type);
CREATE INDEX IF NOT EXISTS idx_service_discovery_health_status ON service_discovery(health_status);
CREATE INDEX IF NOT EXISTS idx_service_discovery_tags_gin ON service_discovery USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_service_discovery_metadata_gin ON service_discovery USING GIN (metadata);

-- Distributed coordination indexes
CREATE INDEX IF NOT EXISTS idx_distributed_locks_lock_id ON distributed_locks(lock_id);
CREATE INDEX IF NOT EXISTS idx_distributed_locks_resource ON distributed_locks(resource);
CREATE INDEX IF NOT EXISTS idx_distributed_locks_owner ON distributed_locks(owner);
CREATE INDEX IF NOT EXISTS idx_distributed_locks_expires_at ON distributed_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_distributed_locks_status ON distributed_locks(status);

CREATE INDEX IF NOT EXISTS idx_leader_election_key ON leader_election(election_key);
CREATE INDEX IF NOT EXISTS idx_leader_election_leader ON leader_election(current_leader);
CREATE INDEX IF NOT EXISTS idx_leader_election_status ON leader_election(status);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_scaling_analytics_time_window ON scaling_analytics(time_window_start, time_window_end);
CREATE INDEX IF NOT EXISTS idx_scaling_analytics_created_at ON scaling_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_scaling_analytics_system_metrics_gin ON scaling_analytics USING GIN (system_metrics);
CREATE INDEX IF NOT EXISTS idx_scaling_analytics_agent_metrics_gin ON scaling_analytics USING GIN (agent_type_metrics);

-- =====================================
-- UTILITY FUNCTIONS
-- =====================================

-- Function to get active agent placements by type
CREATE OR REPLACE FUNCTION get_active_agent_placements(p_agent_type VARCHAR DEFAULT NULL)
RETURNS TABLE (
    agent_id VARCHAR(255),
    agent_type VARCHAR(100),
    server_id VARCHAR(255),
    server_address VARCHAR(255),
    status VARCHAR(50),
    allocated_resources JSONB,
    performance_metrics JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ap.agent_id,
        ap.agent_type,
        ap.server_id,
        ap.server_address,
        ap.status,
        ap.allocated_resources,
        ap.performance_metrics,
        ap.created_at
    FROM agent_placements ap
    WHERE 
        ap.status IN ('running', 'starting')
        AND (p_agent_type IS NULL OR ap.agent_type = p_agent_type)
    ORDER BY ap.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get server resource utilization
CREATE OR REPLACE FUNCTION get_server_resource_utilization()
RETURNS TABLE (
    server_id VARCHAR(255),
    server_address VARCHAR(255),
    total_agents INTEGER,
    resource_usage JSONB,
    utilization_score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sn.server_id,
        sn.server_address,
        COUNT(ap.id)::INTEGER as total_agents,
        jsonb_build_object(
            'cpu_usage', COALESCE(AVG((ap.resource_usage->>'cpu_usage')::DECIMAL), 0),
            'memory_usage', COALESCE(AVG((ap.resource_usage->>'memory_usage')::DECIMAL), 0),
            'disk_usage', COALESCE(AVG((ap.resource_usage->>'disk_usage')::DECIMAL), 0)
        ) as resource_usage,
        COALESCE(AVG((ap.resource_usage->>'cpu_usage')::DECIMAL), 0) as utilization_score
    FROM server_nodes sn
    LEFT JOIN agent_placements ap ON sn.server_id = ap.server_id AND ap.status = 'running'
    GROUP BY sn.server_id, sn.server_address
    ORDER BY utilization_score;
END;
$$ LANGUAGE plpgsql;

-- Function to analyze scaling patterns
CREATE OR REPLACE FUNCTION analyze_scaling_patterns(
    p_time_window_hours INTEGER DEFAULT 24,
    p_agent_type VARCHAR DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    start_time TIMESTAMP WITH TIME ZONE;
BEGIN
    start_time := NOW() - (p_time_window_hours || ' hours')::INTERVAL;
    
    SELECT jsonb_build_object(
        'time_window_hours', p_time_window_hours,
        'analysis_period', jsonb_build_object(
            'start', start_time,
            'end', NOW()
        ),
        'scaling_operations', jsonb_build_object(
            'total', COUNT(*),
            'scale_up', COUNT(*) FILTER (WHERE operation_type = 'scale-up'),
            'scale_down', COUNT(*) FILTER (WHERE operation_type = 'scale-down'),
            'migrate', COUNT(*) FILTER (WHERE operation_type = 'migrate'),
            'success_rate', ROUND(
                COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / 
                GREATEST(COUNT(*), 1) * 100, 2
            )
        ),
        'agent_types', jsonb_object_agg(
            agent_type,
            jsonb_build_object(
                'operations', COUNT(*),
                'avg_scaling_time', ROUND(AVG(scaling_time_ms), 2)
            )
        ),
        'performance_trends', jsonb_build_object(
            'avg_scaling_time', ROUND(AVG(scaling_time_ms), 2),
            'median_scaling_time', ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY scaling_time_ms), 2),
            'fastest_operation', MIN(scaling_time_ms),
            'slowest_operation', MAX(scaling_time_ms)
        )
    ) INTO result
    FROM scaling_operations
    WHERE 
        started_at >= start_time
        AND (p_agent_type IS NULL OR agent_type = p_agent_type);
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old records
CREATE OR REPLACE FUNCTION cleanup_old_scaling_data(
    p_retention_days INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    cutoff_date TIMESTAMP WITH TIME ZONE;
    deleted_operations INTEGER;
    deleted_analytics INTEGER;
    deleted_locks INTEGER;
BEGIN
    cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;
    
    -- Delete old scaling operations
    DELETE FROM scaling_operations 
    WHERE started_at < cutoff_date;
    GET DIAGNOSTICS deleted_operations = ROW_COUNT;
    
    -- Delete old analytics data
    DELETE FROM scaling_analytics 
    WHERE created_at < cutoff_date;
    GET DIAGNOSTICS deleted_analytics = ROW_COUNT;
    
    -- Delete expired locks
    DELETE FROM distributed_locks 
    WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_locks = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'cleanup_date', cutoff_date,
        'deleted_records', jsonb_build_object(
            'scaling_operations', deleted_operations,
            'analytics', deleted_analytics,
            'expired_locks', deleted_locks
        ),
        'retention_days', p_retention_days,
        'executed_at', NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- TRIGGERS AND MAINTENANCE
-- =====================================

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_server_nodes_updated_at
    BEFORE UPDATE ON server_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scaling_policies_updated_at
    BEFORE UPDATE ON scaling_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_load_balancing_updated_at
    BEFORE UPDATE ON load_balancing_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_discovery_updated_at
    BEFORE UPDATE ON service_discovery
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leader_election_updated_at
    BEFORE UPDATE ON leader_election
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================
-- INITIAL DATA AND CONFIGURATION
-- =====================================

-- Insert default scaling policies for standard agent types
INSERT INTO scaling_policies (
    policy_id, agent_type, policy_config, min_instances, max_instances,
    scale_up_threshold, scale_down_threshold, scaling_metrics, enabled
) VALUES 
(
    'legal-document-processor-policy',
    'legal-document-processor',
    '{"strategy": "resource-aware", "priority": "high"}',
    1, 8, 0.8, 0.3,
    '["cpu_usage", "memory_usage", "queue_length"]',
    true
),
(
    'vector-search-engine-policy',
    'vector-search-engine',
    '{"strategy": "performance-optimized", "priority": "high"}',
    2, 6, 0.7, 0.2,
    '["response_time", "query_rate", "cpu_usage"]',
    true
),
(
    'embedding-generator-policy',
    'embedding-generator',
    '{"strategy": "gpu-aware", "priority": "medium"}',
    1, 4, 0.75, 0.25,
    '["gpu_usage", "embedding_rate", "queue_length"]',
    true
),
(
    'classification-agent-policy',
    'classification-agent',
    '{"strategy": "accuracy-first", "priority": "medium"}',
    1, 6, 0.8, 0.3,
    '["classification_rate", "accuracy", "cpu_usage"]',
    true
),
(
    'summarization-agent-policy',
    'summarization-agent',
    '{"strategy": "quality-focused", "priority": "medium"}',
    1, 4, 0.7, 0.25,
    '["summarization_rate", "quality_score", "memory_usage"]',
    true
),
(
    'analysis-agent-policy',
    'analysis-agent',
    '{"strategy": "comprehensive", "priority": "low"}',
    1, 3, 0.8, 0.4,
    '["analysis_depth", "processing_time", "resource_usage"]',
    true
)
ON CONFLICT (policy_id) DO NOTHING;

-- =====================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================

COMMENT ON TABLE server_nodes IS 'Registry of server nodes in the horizontal scaling cluster with JSONB metadata';
COMMENT ON TABLE agent_placements IS 'Tracking of agent deployments and placements across servers with flexible JSONB configuration';
COMMENT ON TABLE scaling_policies IS 'Auto-scaling policies and rules for different agent types with JSONB-based configuration';
COMMENT ON TABLE scaling_operations IS 'Historical record of scaling operations with detailed JSONB metrics and results';
COMMENT ON TABLE load_balancing_state IS 'Load balancing configuration and state with JSONB routing information';
COMMENT ON TABLE service_discovery IS 'Service discovery registry with JSONB metadata for dynamic service location';
COMMENT ON TABLE distributed_locks IS 'Distributed coordination locks for scaling operations with JSONB metadata';
COMMENT ON TABLE leader_election IS 'Leader election state for distributed scaling coordination';
COMMENT ON TABLE scaling_analytics IS 'System-wide scaling analytics and insights with comprehensive JSONB metrics';

COMMENT ON FUNCTION get_active_agent_placements IS 'Retrieve active agent placements filtered by agent type';
COMMENT ON FUNCTION get_server_resource_utilization IS 'Calculate resource utilization across all servers';
COMMENT ON FUNCTION analyze_scaling_patterns IS 'Analyze scaling patterns and performance trends with JSONB results';
COMMENT ON FUNCTION cleanup_old_scaling_data IS 'Clean up old scaling data based on retention policy';

-- Grant permissions for the scaling system
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO legal_admin;