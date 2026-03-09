/**
 * Advanced Multi-Layer Caching Database Schema with JSONB
 * 
 * Production-ready schema for storing advanced caching data using JSONB
 * for flexible metadata and configuration storage.
 * 
 * Features:
 * - Cache entry storage with compression and metadata
 * - Layer-specific cache management
 * - Performance analytics and metrics
 * - Access pattern tracking
 * - Cache coherence and versioning
 * - Intelligent cache optimization data
 * - Predictive caching analytics
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =====================================
-- CACHE ENTRIES AND STORAGE
-- =====================================

-- Main cache entries table with JSONB data
CREATE TABLE IF NOT EXISTS cache_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(500) NOT NULL,
    cache_layer VARCHAR(100) NOT NULL,
    
    -- Cache value storage
    cache_value JSONB NOT NULL,
    value_type VARCHAR(100) DEFAULT 'unknown',
    value_size INTEGER DEFAULT 0,
    
    -- Compression and encoding
    is_compressed BOOLEAN DEFAULT false,
    compression_type VARCHAR(50),
    compression_ratio DECIMAL(5,4),
    original_size INTEGER,
    
    -- Cache metadata
    cache_metadata JSONB NOT NULL DEFAULT '{}',
    
    -- TTL and expiration
    ttl_seconds INTEGER DEFAULT 3600,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Access tracking
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    first_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Version and coherence
    version INTEGER DEFAULT 1,
    coherence_hash VARCHAR(64),
    
    -- Performance tracking
    access_pattern JSONB DEFAULT '{}',
    performance_metrics JSONB DEFAULT '{}',
    
    -- Storage optimization
    storage_tier VARCHAR(50) DEFAULT 'standard',
    optimization_score DECIMAL(5,4) DEFAULT 0.0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Tagging and categorization
    tags JSONB DEFAULT '[]',
    data_classification VARCHAR(100),
    
    UNIQUE(cache_key, cache_layer)
);

-- =====================================
-- CACHE LAYER CONFIGURATION
-- =====================================

-- Cache layer configurations and status
CREATE TABLE IF NOT EXISTS cache_layers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    layer_name VARCHAR(100) UNIQUE NOT NULL,
    layer_type VARCHAR(100) NOT NULL,
    
    -- Layer configuration
    configuration JSONB NOT NULL DEFAULT '{}',
    
    -- Capacity and limits
    max_capacity INTEGER DEFAULT 10000,
    current_size INTEGER DEFAULT 0,
    max_memory_bytes BIGINT,
    current_memory_bytes BIGINT DEFAULT 0,
    
    -- Performance settings
    default_ttl INTEGER DEFAULT 3600,
    priority INTEGER DEFAULT 5,
    
    -- Layer status
    status VARCHAR(50) DEFAULT 'active',
    is_enabled BOOLEAN DEFAULT true,
    
    -- Health and monitoring
    health_status JSONB DEFAULT '{}',
    last_health_check TIMESTAMP WITH TIME ZONE,
    
    -- Performance metrics
    performance_stats JSONB DEFAULT '{}',
    
    -- Layer policies
    eviction_policy VARCHAR(100) DEFAULT 'lru',
    policy_configuration JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Versioning
    version INTEGER DEFAULT 1,
    change_log JSONB DEFAULT '[]'
);

-- =====================================
-- CACHE ACCESS ANALYTICS
-- =====================================

-- Cache access patterns and analytics
CREATE TABLE IF NOT EXISTS cache_access_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(500) NOT NULL,
    
    -- Access statistics
    total_accesses INTEGER DEFAULT 0,
    recent_accesses INTEGER DEFAULT 0,
    access_frequency VARCHAR(50) DEFAULT 'low',
    
    -- Temporal patterns
    access_times JSONB DEFAULT '[]',
    hourly_distribution JSONB DEFAULT '{}',
    daily_distribution JSONB DEFAULT '{}',
    weekly_distribution JSONB DEFAULT '{}',
    
    -- Performance metrics
    average_response_time DECIMAL(10,4) DEFAULT 0.0,
    hit_rate DECIMAL(5,4) DEFAULT 0.0,
    miss_rate DECIMAL(5,4) DEFAULT 0.0,
    
    -- Access characteristics
    access_source_distribution JSONB DEFAULT '{}',
    layer_hit_distribution JSONB DEFAULT '{}',
    
    -- Predictive data
    prediction_accuracy DECIMAL(5,4) DEFAULT 0.0,
    next_access_prediction TIMESTAMP WITH TIME ZONE,
    access_likelihood DECIMAL(5,4) DEFAULT 0.0,
    
    -- Pattern metadata
    pattern_metadata JSONB DEFAULT '{}',
    anomalies JSONB DEFAULT '[]',
    
    -- Analysis period
    analysis_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    analysis_end TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(cache_key)
);

-- =====================================
-- CACHE PERFORMANCE METRICS
-- =====================================

-- System-wide cache performance metrics
CREATE TABLE IF NOT EXISTS cache_performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Time window for metrics
    metric_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    time_window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    time_window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    aggregation_level VARCHAR(50) DEFAULT 'system', -- system, layer, key
    
    -- Performance metrics
    total_operations INTEGER DEFAULT 0,
    get_operations INTEGER DEFAULT 0,
    set_operations INTEGER DEFAULT 0,
    delete_operations INTEGER DEFAULT 0,
    
    -- Hit/Miss statistics
    cache_hits INTEGER DEFAULT 0,
    cache_misses INTEGER DEFAULT 0,
    hit_rate DECIMAL(5,4) DEFAULT 0.0,
    
    -- Response time metrics
    average_response_time DECIMAL(10,4) DEFAULT 0.0,
    median_response_time DECIMAL(10,4) DEFAULT 0.0,
    p95_response_time DECIMAL(10,4) DEFAULT 0.0,
    p99_response_time DECIMAL(10,4) DEFAULT 0.0,
    
    -- Throughput metrics
    operations_per_second DECIMAL(10,4) DEFAULT 0.0,
    bytes_per_second BIGINT DEFAULT 0,
    
    -- Error metrics
    error_count INTEGER DEFAULT 0,
    error_rate DECIMAL(5,4) DEFAULT 0.0,
    timeout_count INTEGER DEFAULT 0,
    
    -- Layer-specific metrics
    layer_metrics JSONB DEFAULT '{}',
    
    -- Resource utilization
    memory_usage_bytes BIGINT DEFAULT 0,
    memory_utilization DECIMAL(5,4) DEFAULT 0.0,
    cpu_utilization DECIMAL(5,4) DEFAULT 0.0,
    
    -- Compression and efficiency
    compression_savings_bytes BIGINT DEFAULT 0,
    compression_ratio DECIMAL(5,4) DEFAULT 0.0,
    storage_efficiency DECIMAL(5,4) DEFAULT 0.0,
    
    -- Predictive metrics
    predictive_hits INTEGER DEFAULT 0,
    prediction_accuracy DECIMAL(5,4) DEFAULT 0.0,
    
    -- Additional metrics
    custom_metrics JSONB DEFAULT '{}',
    
    -- Data source
    metric_source VARCHAR(100) DEFAULT 'cache-manager',
    collection_method VARCHAR(100) DEFAULT 'automatic'
);

-- =====================================
-- CACHE STRATEGIES AND POLICIES
-- =====================================

-- Cache strategies configuration
CREATE TABLE IF NOT EXISTS cache_strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id VARCHAR(255) UNIQUE NOT NULL,
    strategy_name VARCHAR(255) NOT NULL,
    strategy_type VARCHAR(100) NOT NULL,
    
    -- Strategy configuration
    strategy_config JSONB NOT NULL DEFAULT '{}',
    
    -- Read/Write strategies
    read_strategy VARCHAR(100) DEFAULT 'l1-first',
    write_strategy VARCHAR(100) DEFAULT 'write-through',
    consistency_level VARCHAR(100) DEFAULT 'eventual',
    
    -- Performance parameters
    performance_targets JSONB DEFAULT '{}',
    optimization_parameters JSONB DEFAULT '{}',
    
    -- Strategy status
    is_active BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,4) DEFAULT 0.0,
    performance_score DECIMAL(5,4) DEFAULT 0.0,
    
    -- Strategy metadata
    description TEXT,
    use_cases JSONB DEFAULT '[]',
    prerequisites JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    
    -- Versioning
    version INTEGER DEFAULT 1
);

-- Cache policies configuration
CREATE TABLE IF NOT EXISTS cache_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id VARCHAR(255) UNIQUE NOT NULL,
    policy_name VARCHAR(255) NOT NULL,
    policy_type VARCHAR(100) NOT NULL,
    
    -- Policy configuration
    policy_config JSONB NOT NULL DEFAULT '{}',
    
    -- Eviction settings
    eviction_strategy VARCHAR(100) DEFAULT 'lru',
    max_age_seconds INTEGER DEFAULT 3600,
    max_size INTEGER DEFAULT 10000,
    max_memory_bytes BIGINT,
    
    -- Scoring and prioritization
    scoring_function TEXT,
    priority_weights JSONB DEFAULT '{}',
    
    -- Policy rules
    inclusion_rules JSONB DEFAULT '[]',
    exclusion_rules JSONB DEFAULT '[]',
    ttl_rules JSONB DEFAULT '[]',
    
    -- Performance tracking
    eviction_count INTEGER DEFAULT 0,
    efficiency_score DECIMAL(5,4) DEFAULT 0.0,
    
    -- Policy status
    is_enabled BOOLEAN DEFAULT true,
    applies_to_layers JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Versioning
    version INTEGER DEFAULT 1
);

-- =====================================
-- CACHE OPTIMIZATION AND RECOMMENDATIONS
-- =====================================

-- Cache optimization recommendations
CREATE TABLE IF NOT EXISTS cache_optimization_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recommendation_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Recommendation details
    recommendation_type VARCHAR(100) NOT NULL,
    priority VARCHAR(50) DEFAULT 'medium',
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Analysis data
    analysis_data JSONB NOT NULL DEFAULT '{}',
    supporting_metrics JSONB DEFAULT '{}',
    
    -- Impact estimation
    estimated_impact JSONB DEFAULT '{}',
    confidence_score DECIMAL(5,4) DEFAULT 0.0,
    
    -- Implementation details
    implementation_steps JSONB DEFAULT '[]',
    implementation_difficulty VARCHAR(50) DEFAULT 'medium',
    estimated_effort_hours INTEGER,
    
    -- Status and tracking
    status VARCHAR(50) DEFAULT 'pending',
    is_implemented BOOLEAN DEFAULT false,
    implementation_date TIMESTAMP WITH TIME ZONE,
    
    -- Results tracking
    actual_impact JSONB DEFAULT '{}',
    effectiveness_score DECIMAL(5,4),
    
    -- Recommendation metadata
    generated_by VARCHAR(100) DEFAULT 'system',
    recommendation_source VARCHAR(100),
    tags JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Approval workflow
    approval_status VARCHAR(50) DEFAULT 'auto-approved',
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE
);

-- =====================================
-- CACHE COHERENCE AND CONSISTENCY
-- =====================================

-- Cache coherence tracking
CREATE TABLE IF NOT EXISTS cache_coherence_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(500) NOT NULL,
    
    -- Operation details
    operation_type VARCHAR(50) NOT NULL, -- set, delete, invalidate, sync
    operation_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Coherence data
    affected_layers JSONB NOT NULL DEFAULT '[]',
    version_before INTEGER,
    version_after INTEGER,
    coherence_hash_before VARCHAR(64),
    coherence_hash_after VARCHAR(64),
    
    -- Synchronization data
    sync_status VARCHAR(50) DEFAULT 'pending',
    sync_results JSONB DEFAULT '{}',
    
    -- Consistency checking
    consistency_check_results JSONB DEFAULT '{}',
    inconsistencies_detected JSONB DEFAULT '[]',
    
    -- Resolution data
    resolution_strategy VARCHAR(100),
    resolution_timestamp TIMESTAMP WITH TIME ZONE,
    resolution_successful BOOLEAN,
    
    -- Operation metadata
    operation_source VARCHAR(100),
    operation_metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- PREDICTIVE CACHING DATA
-- =====================================

-- Predictive caching models and data
CREATE TABLE IF NOT EXISTS cache_predictive_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id VARCHAR(255) UNIQUE NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    model_type VARCHAR(100) NOT NULL,
    
    -- Model configuration
    model_config JSONB NOT NULL DEFAULT '{}',
    training_parameters JSONB DEFAULT '{}',
    
    -- Model performance
    accuracy_score DECIMAL(5,4) DEFAULT 0.0,
    precision_score DECIMAL(5,4) DEFAULT 0.0,
    recall_score DECIMAL(5,4) DEFAULT 0.0,
    f1_score DECIMAL(5,4) DEFAULT 0.0,
    
    -- Training data
    training_data_size INTEGER DEFAULT 0,
    training_start_date TIMESTAMP WITH TIME ZONE,
    training_end_date TIMESTAMP WITH TIME ZONE,
    last_training_date TIMESTAMP WITH TIME ZONE,
    
    -- Model status
    status VARCHAR(50) DEFAULT 'training',
    is_active BOOLEAN DEFAULT false,
    
    -- Model artifacts
    model_artifacts JSONB DEFAULT '{}',
    feature_importance JSONB DEFAULT '{}',
    
    -- Usage tracking
    prediction_count INTEGER DEFAULT 0,
    successful_predictions INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Versioning
    version INTEGER DEFAULT 1
);

-- Predictive cache recommendations
CREATE TABLE IF NOT EXISTS cache_predictive_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id VARCHAR(255) REFERENCES cache_predictive_models(model_id),
    cache_key VARCHAR(500) NOT NULL,
    
    -- Prediction details
    prediction_type VARCHAR(100) NOT NULL, -- preload, evict, promote, demote
    confidence_score DECIMAL(5,4) NOT NULL,
    predicted_access_time TIMESTAMP WITH TIME ZONE,
    
    -- Recommendation data
    recommended_action JSONB NOT NULL DEFAULT '{}',
    expected_benefit JSONB DEFAULT '{}',
    
    -- Execution tracking
    is_executed BOOLEAN DEFAULT false,
    execution_timestamp TIMESTAMP WITH TIME ZONE,
    execution_result JSONB DEFAULT '{}',
    
    -- Validation
    actual_outcome JSONB DEFAULT '{}',
    prediction_accuracy DECIMAL(5,4),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- =====================================
-- INDEXES FOR OPTIMAL PERFORMANCE
-- =====================================

-- Cache entries indexes
CREATE INDEX IF NOT EXISTS idx_cache_entries_key_layer ON cache_entries(cache_key, cache_layer);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_entries_last_accessed ON cache_entries(last_accessed);
CREATE INDEX IF NOT EXISTS idx_cache_entries_access_count ON cache_entries(access_count DESC);
CREATE INDEX IF NOT EXISTS idx_cache_entries_value_type ON cache_entries(value_type);
CREATE INDEX IF NOT EXISTS idx_cache_entries_layer ON cache_entries(cache_layer);
CREATE INDEX IF NOT EXISTS idx_cache_entries_size ON cache_entries(value_size DESC);
CREATE INDEX IF NOT EXISTS idx_cache_entries_metadata_gin ON cache_entries USING GIN (cache_metadata);
CREATE INDEX IF NOT EXISTS idx_cache_entries_tags_gin ON cache_entries USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_cache_entries_pattern_gin ON cache_entries USING GIN (access_pattern);

-- Cache layers indexes
CREATE INDEX IF NOT EXISTS idx_cache_layers_name ON cache_layers(layer_name);
CREATE INDEX IF NOT EXISTS idx_cache_layers_type ON cache_layers(layer_type);
CREATE INDEX IF NOT EXISTS idx_cache_layers_status ON cache_layers(status);
CREATE INDEX IF NOT EXISTS idx_cache_layers_enabled ON cache_layers(is_enabled);
CREATE INDEX IF NOT EXISTS idx_cache_layers_priority ON cache_layers(priority);
CREATE INDEX IF NOT EXISTS idx_cache_layers_config_gin ON cache_layers USING GIN (configuration);

-- Access patterns indexes
CREATE INDEX IF NOT EXISTS idx_access_patterns_key ON cache_access_patterns(cache_key);
CREATE INDEX IF NOT EXISTS idx_access_patterns_frequency ON cache_access_patterns(access_frequency);
CREATE INDEX IF NOT EXISTS idx_access_patterns_total_accesses ON cache_access_patterns(total_accesses DESC);
CREATE INDEX IF NOT EXISTS idx_access_patterns_updated_at ON cache_access_patterns(updated_at);
CREATE INDEX IF NOT EXISTS idx_access_patterns_times_gin ON cache_access_patterns USING GIN (access_times);
CREATE INDEX IF NOT EXISTS idx_access_patterns_distribution_gin ON cache_access_patterns USING GIN (hourly_distribution);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON cache_performance_metrics(metric_timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_window ON cache_performance_metrics(time_window_start, time_window_end);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_level ON cache_performance_metrics(aggregation_level);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_hit_rate ON cache_performance_metrics(hit_rate DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_layer_gin ON cache_performance_metrics USING GIN (layer_metrics);

-- Strategies and policies indexes
CREATE INDEX IF NOT EXISTS idx_cache_strategies_id ON cache_strategies(strategy_id);
CREATE INDEX IF NOT EXISTS idx_cache_strategies_type ON cache_strategies(strategy_type);
CREATE INDEX IF NOT EXISTS idx_cache_strategies_active ON cache_strategies(is_active);
CREATE INDEX IF NOT EXISTS idx_cache_strategies_default ON cache_strategies(is_default);
CREATE INDEX IF NOT EXISTS idx_cache_strategies_config_gin ON cache_strategies USING GIN (strategy_config);

CREATE INDEX IF NOT EXISTS idx_cache_policies_id ON cache_policies(policy_id);
CREATE INDEX IF NOT EXISTS idx_cache_policies_type ON cache_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_cache_policies_enabled ON cache_policies(is_enabled);
CREATE INDEX IF NOT EXISTS idx_cache_policies_config_gin ON cache_policies USING GIN (policy_config);

-- Optimization recommendations indexes
CREATE INDEX IF NOT EXISTS idx_optimization_recommendations_id ON cache_optimization_recommendations(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_optimization_recommendations_type ON cache_optimization_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_optimization_recommendations_priority ON cache_optimization_recommendations(priority);
CREATE INDEX IF NOT EXISTS idx_optimization_recommendations_status ON cache_optimization_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_optimization_recommendations_created_at ON cache_optimization_recommendations(created_at);
CREATE INDEX IF NOT EXISTS idx_optimization_recommendations_analysis_gin ON cache_optimization_recommendations USING GIN (analysis_data);

-- Coherence log indexes
CREATE INDEX IF NOT EXISTS idx_coherence_log_key ON cache_coherence_log(cache_key);
CREATE INDEX IF NOT EXISTS idx_coherence_log_operation_type ON cache_coherence_log(operation_type);
CREATE INDEX IF NOT EXISTS idx_coherence_log_timestamp ON cache_coherence_log(operation_timestamp);
CREATE INDEX IF NOT EXISTS idx_coherence_log_sync_status ON cache_coherence_log(sync_status);
CREATE INDEX IF NOT EXISTS idx_coherence_log_layers_gin ON cache_coherence_log USING GIN (affected_layers);

-- Predictive models indexes
CREATE INDEX IF NOT EXISTS idx_predictive_models_id ON cache_predictive_models(model_id);
CREATE INDEX IF NOT EXISTS idx_predictive_models_type ON cache_predictive_models(model_type);
CREATE INDEX IF NOT EXISTS idx_predictive_models_status ON cache_predictive_models(status);
CREATE INDEX IF NOT EXISTS idx_predictive_models_active ON cache_predictive_models(is_active);
CREATE INDEX IF NOT EXISTS idx_predictive_models_accuracy ON cache_predictive_models(accuracy_score DESC);

CREATE INDEX IF NOT EXISTS idx_predictive_recommendations_model ON cache_predictive_recommendations(model_id);
CREATE INDEX IF NOT EXISTS idx_predictive_recommendations_key ON cache_predictive_recommendations(cache_key);
CREATE INDEX IF NOT EXISTS idx_predictive_recommendations_type ON cache_predictive_recommendations(prediction_type);
CREATE INDEX IF NOT EXISTS idx_predictive_recommendations_confidence ON cache_predictive_recommendations(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_predictive_recommendations_executed ON cache_predictive_recommendations(is_executed);

-- =====================================
-- UTILITY FUNCTIONS
-- =====================================

-- Function to get cache statistics by layer
CREATE OR REPLACE FUNCTION get_cache_layer_stats(p_layer_name VARCHAR DEFAULT NULL)
RETURNS TABLE (
    layer_name VARCHAR(100),
    total_entries INTEGER,
    total_size_bytes BIGINT,
    average_access_count DECIMAL,
    hit_rate_estimate DECIMAL,
    memory_utilization DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ce.cache_layer,
        COUNT(*)::INTEGER as total_entries,
        SUM(ce.value_size)::BIGINT as total_size_bytes,
        AVG(ce.access_count)::DECIMAL as average_access_count,
        COALESCE(AVG(ap.hit_rate), 0.0)::DECIMAL as hit_rate_estimate,
        (SUM(ce.value_size)::DECIMAL / COALESCE(cl.max_memory_bytes, 1))::DECIMAL as memory_utilization
    FROM cache_entries ce
    LEFT JOIN cache_access_patterns ap ON ce.cache_key = ap.cache_key
    LEFT JOIN cache_layers cl ON ce.cache_layer = cl.layer_name
    WHERE 
        ce.expires_at > NOW()
        AND (p_layer_name IS NULL OR ce.cache_layer = p_layer_name)
    GROUP BY ce.cache_layer, cl.max_memory_bytes
    ORDER BY total_entries DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to identify hot keys
CREATE OR REPLACE FUNCTION get_hot_cache_keys(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    cache_key VARCHAR(500),
    access_count INTEGER,
    access_frequency VARCHAR(50),
    last_accessed TIMESTAMP WITH TIME ZONE,
    hit_rate DECIMAL,
    layers_present JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ap.cache_key,
        ap.total_accesses,
        ap.access_frequency,
        ce.last_accessed,
        ap.hit_rate,
        jsonb_agg(DISTINCT ce.cache_layer) as layers_present
    FROM cache_access_patterns ap
    JOIN cache_entries ce ON ap.cache_key = ce.cache_key
    WHERE 
        ce.expires_at > NOW()
        AND ap.access_frequency IN ('high', 'medium')
    GROUP BY ap.cache_key, ap.total_accesses, ap.access_frequency, ce.last_accessed, ap.hit_rate
    ORDER BY ap.total_accesses DESC, ap.hit_rate DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get cache performance summary
CREATE OR REPLACE FUNCTION get_cache_performance_summary(
    p_time_window_hours INTEGER DEFAULT 24
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
        'operations', jsonb_build_object(
            'total', COALESCE(SUM(total_operations), 0),
            'gets', COALESCE(SUM(get_operations), 0),
            'sets', COALESCE(SUM(set_operations), 0),
            'deletes', COALESCE(SUM(delete_operations), 0)
        ),
        'performance', jsonb_build_object(
            'overall_hit_rate', ROUND(AVG(hit_rate), 4),
            'average_response_time', ROUND(AVG(average_response_time), 4),
            'operations_per_second', ROUND(AVG(operations_per_second), 2),
            'error_rate', ROUND(AVG(error_rate), 4)
        ),
        'efficiency', jsonb_build_object(
            'compression_savings_gb', ROUND(SUM(compression_savings_bytes) / 1024.0 / 1024.0 / 1024.0, 2),
            'average_compression_ratio', ROUND(AVG(compression_ratio), 4),
            'storage_efficiency', ROUND(AVG(storage_efficiency), 4)
        ),
        'predictive', jsonb_build_object(
            'total_predictive_hits', COALESCE(SUM(predictive_hits), 0),
            'average_prediction_accuracy', ROUND(AVG(prediction_accuracy), 4)
        )
    ) INTO result
    FROM cache_performance_metrics
    WHERE metric_timestamp >= start_time;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache_entries(
    p_retention_hours INTEGER DEFAULT 24
)
RETURNS JSONB AS $$
DECLARE
    cutoff_date TIMESTAMP WITH TIME ZONE;
    deleted_entries INTEGER;
    deleted_patterns INTEGER;
    deleted_coherence INTEGER;
    freed_bytes BIGINT;
BEGIN
    cutoff_date := NOW() - (p_retention_hours || ' hours')::INTERVAL;
    
    -- Calculate space that will be freed
    SELECT COALESCE(SUM(value_size), 0) INTO freed_bytes
    FROM cache_entries 
    WHERE expires_at < NOW();
    
    -- Delete expired cache entries
    DELETE FROM cache_entries 
    WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_entries = ROW_COUNT;
    
    -- Delete old access patterns (older than retention period)
    DELETE FROM cache_access_patterns 
    WHERE updated_at < cutoff_date;
    GET DIAGNOSTICS deleted_patterns = ROW_COUNT;
    
    -- Delete old coherence log entries
    DELETE FROM cache_coherence_log 
    WHERE operation_timestamp < cutoff_date;
    GET DIAGNOSTICS deleted_coherence = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'cleanup_date', cutoff_date,
        'deleted_records', jsonb_build_object(
            'cache_entries', deleted_entries,
            'access_patterns', deleted_patterns,
            'coherence_log', deleted_coherence
        ),
        'freed_space_mb', ROUND(freed_bytes / 1024.0 / 1024.0, 2),
        'retention_hours', p_retention_hours,
        'executed_at', NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- Function to analyze cache optimization opportunities
CREATE OR REPLACE FUNCTION analyze_cache_optimization_opportunities()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    hot_keys_count INTEGER;
    cold_keys_count INTEGER;
    low_hit_rate_keys_count INTEGER;
    oversized_keys_count INTEGER;
BEGIN
    -- Count hot keys that could benefit from promotion
    SELECT COUNT(*) INTO hot_keys_count
    FROM cache_access_patterns
    WHERE access_frequency = 'high' AND hit_rate < 0.9;
    
    -- Count cold keys that could be evicted
    SELECT COUNT(*) INTO cold_keys_count
    FROM cache_access_patterns ap
    JOIN cache_entries ce ON ap.cache_key = ce.cache_key
    WHERE ap.total_accesses < 5 AND ce.last_accessed < NOW() - INTERVAL '1 hour';
    
    -- Count keys with low hit rates
    SELECT COUNT(*) INTO low_hit_rate_keys_count
    FROM cache_access_patterns
    WHERE hit_rate < 0.5 AND total_accesses > 10;
    
    -- Count oversized keys that could benefit from compression
    SELECT COUNT(*) INTO oversized_keys_count
    FROM cache_entries
    WHERE value_size > 10240 AND NOT is_compressed;
    
    SELECT jsonb_build_object(
        'optimization_opportunities', jsonb_build_object(
            'hot_keys_for_promotion', hot_keys_count,
            'cold_keys_for_eviction', cold_keys_count,
            'low_hit_rate_keys', low_hit_rate_keys_count,
            'oversized_uncompressed_keys', oversized_keys_count
        ),
        'recommendations', jsonb_build_array(
            CASE WHEN hot_keys_count > 0 THEN 
                jsonb_build_object(
                    'type', 'promote_hot_keys',
                    'priority', 'high',
                    'count', hot_keys_count,
                    'description', 'Promote hot keys to higher cache layers'
                )
            END,
            CASE WHEN cold_keys_count > 0 THEN 
                jsonb_build_object(
                    'type', 'evict_cold_keys',
                    'priority', 'medium',
                    'count', cold_keys_count,
                    'description', 'Evict cold keys to free up cache space'
                )
            END,
            CASE WHEN oversized_keys_count > 0 THEN 
                jsonb_build_object(
                    'type', 'compress_large_objects',
                    'priority', 'medium',
                    'count', oversized_keys_count,
                    'description', 'Enable compression for large cache objects'
                )
            END
        ),
        'analysis_timestamp', NOW()
    ) INTO result;
    
    RETURN result;
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

CREATE TRIGGER update_cache_entries_updated_at
    BEFORE UPDATE ON cache_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cache_layers_updated_at
    BEFORE UPDATE ON cache_layers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_access_patterns_updated_at
    BEFORE UPDATE ON cache_access_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategies_updated_at
    BEFORE UPDATE ON cache_strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_policies_updated_at
    BEFORE UPDATE ON cache_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recommendations_updated_at
    BEFORE UPDATE ON cache_optimization_recommendations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_predictive_models_updated_at
    BEFORE UPDATE ON cache_predictive_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================
-- INITIAL DATA AND CONFIGURATION
-- =====================================

-- Insert default cache layers
INSERT INTO cache_layers (
    layer_name, layer_type, configuration, max_capacity, default_ttl, priority
) VALUES 
(
    'memory',
    'in-memory',
    '{"type": "lru", "eviction_policy": "lru", "compression": false}',
    10000, 300, 1
),
(
    'redis',
    'distributed',
    '{"host": "localhost", "port": 6379, "compression": true}',
    100000, 3600, 2
),
(
    'postgres',
    'persistent',
    '{"table": "cache_entries", "compression": true, "indexing": true}',
    1000000, 86400, 3
),
(
    'vector',
    'vector-store',
    '{"similarity_threshold": 0.8, "embedding_dim": 384}',
    50000, 7200, 4
),
(
    'filesystem',
    'file-based',
    '{"base_path": "/tmp/cache", "compression": true, "sharding": true}',
    1000000, 86400, 5
)
ON CONFLICT (layer_name) DO NOTHING;

-- Insert default cache strategies
INSERT INTO cache_strategies (
    strategy_id, strategy_name, strategy_type, strategy_config, read_strategy, write_strategy, consistency_level, is_default
) VALUES 
(
    'adaptive-intelligence',
    'Adaptive Intelligence Strategy',
    'intelligent',
    '{"ai_driven": true, "learning_enabled": true, "optimization_interval": 300}',
    'intelligent-routing', 'adaptive-propagation', 'eventual', true
),
(
    'write-through-consistent',
    'Write-Through Consistency Strategy',
    'consistency-focused',
    '{"synchronous_writes": true, "immediate_consistency": true}',
    'l1-first', 'all-layers', 'strong', false
),
(
    'performance-optimized',
    'Performance Optimized Strategy',
    'performance-focused',
    '{"async_writes": true, "aggressive_caching": true}',
    'l1-first', 'async-propagation', 'eventual', false
),
(
    'memory-efficient',
    'Memory Efficient Strategy',
    'resource-optimized',
    '{"compression_enabled": true, "smart_eviction": true}',
    'compressed-first', 'compressed-writes', 'eventual', false
)
ON CONFLICT (strategy_id) DO NOTHING;

-- Insert default cache policies
INSERT INTO cache_policies (
    policy_id, policy_name, policy_type, policy_config, eviction_strategy, max_age_seconds, max_size
) VALUES 
(
    'intelligent-lru',
    'Intelligent LRU Policy',
    'intelligent',
    '{"ml_scoring": true, "access_pattern_weight": 0.4, "recency_weight": 0.3, "frequency_weight": 0.3}',
    'ml-predicted', 3600, 10000
),
(
    'time-based-expiry',
    'Time-Based Expiry Policy',
    'time-based',
    '{"sliding_window": true, "access_extension": true}',
    'time-based', 3600, 50000
),
(
    'size-aware-lru',
    'Size-Aware LRU Policy',
    'size-optimized',
    '{"size_penalty": true, "compression_bonus": true}',
    'size-weighted-lru', 7200, 100000
),
(
    'frequency-based',
    'Frequency-Based Policy',
    'frequency-optimized',
    '{"frequency_threshold": 10, "recency_bonus": true}',
    'least-frequently-used', 1800, 25000
)
ON CONFLICT (policy_id) DO NOTHING;

-- Insert sample predictive models
INSERT INTO cache_predictive_models (
    model_id, model_name, model_type, model_config, accuracy_score, status
) VALUES 
(
    'access-pattern-predictor',
    'Access Pattern Predictor',
    'time-series',
    '{"algorithm": "lstm", "window_size": 24, "features": ["hour", "day", "access_count"]}',
    0.85, 'active'
),
(
    'cache-hit-predictor',
    'Cache Hit Predictor',
    'classification',
    '{"algorithm": "random_forest", "features": ["key_type", "access_frequency", "size"]}',
    0.78, 'active'
),
(
    'eviction-optimizer',
    'Eviction Optimizer',
    'reinforcement-learning',
    '{"algorithm": "q-learning", "reward_function": "hit_rate_improvement"}',
    0.72, 'training'
)
ON CONFLICT (model_id) DO NOTHING;

-- =====================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================

COMMENT ON TABLE cache_entries IS 'Main cache storage with JSONB value storage and comprehensive metadata tracking';
COMMENT ON TABLE cache_layers IS 'Cache layer configurations and real-time status monitoring';
COMMENT ON TABLE cache_access_patterns IS 'Access pattern analytics for intelligent caching decisions';
COMMENT ON TABLE cache_performance_metrics IS 'System-wide performance metrics with time-series data';
COMMENT ON TABLE cache_strategies IS 'Configurable caching strategies for different use cases';
COMMENT ON TABLE cache_policies IS 'Cache policies for eviction, TTL, and optimization rules';
COMMENT ON TABLE cache_optimization_recommendations IS 'AI-generated optimization recommendations';
COMMENT ON TABLE cache_coherence_log IS 'Cache coherence and consistency tracking across layers';
COMMENT ON TABLE cache_predictive_models IS 'Machine learning models for predictive caching';
COMMENT ON TABLE cache_predictive_recommendations IS 'AI-generated cache operation recommendations';

COMMENT ON FUNCTION get_cache_layer_stats IS 'Get comprehensive statistics for cache layers';
COMMENT ON FUNCTION get_hot_cache_keys IS 'Identify frequently accessed cache keys for optimization';
COMMENT ON FUNCTION get_cache_performance_summary IS 'Generate performance summary with JSONB analytics';
COMMENT ON FUNCTION cleanup_expired_cache_entries IS 'Clean up expired entries and free storage space';
COMMENT ON FUNCTION analyze_cache_optimization_opportunities IS 'Analyze and recommend cache optimizations';

-- Grant permissions for the caching system
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO legal_admin;