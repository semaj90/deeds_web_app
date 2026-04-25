-- Legal AI Platform - GPU Cache & Reinforcement Learning Migration
-- Creates GPU shader caching system with predictive preloading and RL optimization
-- Optimized for RTX 3060 Ti with 30-layer GPU processing stack
-- Generated: 2025-09-06

-- ============================================================================
-- GPU SHADER CACHE SYSTEM
-- ============================================================================

-- Main shader cache entries with source code, compiled binaries, and metadata
CREATE TABLE IF NOT EXISTS shader_cache_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core identification
    shader_key VARCHAR(255) NOT NULL UNIQUE, -- Human-readable cache key
    shader_hash VARCHAR(64) NOT NULL UNIQUE, -- Content hash (SHA-256) for integrity
    shader_type VARCHAR(50) NOT NULL CHECK (shader_type IN ('vertex', 'fragment', 'compute', 'geometry', 'wgsl', 'glsl')),
    
    -- Source code and compilation
    source_code TEXT NOT NULL, -- Original WGSL/GLSL source
    shader_language VARCHAR(20) NOT NULL DEFAULT 'wgsl', -- 'wgsl', 'glsl', 'hlsl'
    shader_version VARCHAR(50), -- Shader model version
    compiled_binary_path TEXT, -- MinIO path to compiled binary (if supported)
    compiled_binary_size INTEGER, -- Size in bytes
    compilation_time DECIMAL(8,3), -- Compilation time in milliseconds
    compilation_success BOOLEAN DEFAULT true,
    compilation_log TEXT, -- Compiler output/warnings
    
    -- Semantic embeddings for similarity search (384 dimensions for nomic-embed-text)
    source_embedding VECTOR(384), -- Code semantic embedding
    semantic_tags VARCHAR(100)[] DEFAULT '{}', -- ['legal-doc', 'timeline', 'evidence', 'graph']
    
    -- Legal workflow context
    legal_context VARCHAR(100), -- 'case', 'evidence', 'timeline', 'graph', 'analysis'
    visualization_type VARCHAR(50), -- 'scatter', 'network', 'heatmap', 'timeline', '3d'
    complexity INTEGER DEFAULT 0 CHECK (complexity >= 0 AND complexity <= 100), -- Shader complexity score
    
    -- Performance metrics
    performance_metrics JSONB DEFAULT '{}', -- {avg_render_time, memory_usage, gpu_utilization}
    average_render_time DECIMAL(8,3), -- Average render time in microseconds
    memory_footprint INTEGER, -- Memory usage in bytes
    gpu_utilization DECIMAL(5,4) CHECK (gpu_utilization >= 0 AND gpu_utilization <= 1), -- 0.0-1.0
    
    -- Reinforcement learning data
    reinforcement_data JSONB DEFAULT '{}', -- RL metrics and history
    access_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,4) DEFAULT 0.5, -- Success rate 0.0-1.0
    reward_history JSONB DEFAULT '[]', -- Array of rewards over time
    
    -- User and system tags
    user_tags VARCHAR(100)[] DEFAULT '{}', -- User-defined tags
    
    -- Dependencies and parameters
    dependencies JSONB DEFAULT '[]', -- Other shader dependencies
    shader_parameters JSONB DEFAULT '{}', -- Uniform parameters and their types
    asset_bundle JSONB DEFAULT '{}', -- Associated textures, models, etc.
    
    -- Version control and lifecycle
    version INTEGER DEFAULT 1,
    deprecated BOOLEAN DEFAULT false,
    
    -- Audit and ownership
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE
);

-- User shader access patterns for reinforcement learning and predictive preloading
CREATE TABLE IF NOT EXISTS shader_user_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- User and session context
    user_id UUID NOT NULL REFERENCES users(id),
    session_id VARCHAR(100) NOT NULL,
    client_fingerprint TEXT, -- Browser/GPU fingerprint for device-specific optimization
    
    -- Shader access tracking
    shader_cache_id UUID NOT NULL REFERENCES shader_cache_entries(id),
    shader_key VARCHAR(255) NOT NULL,
    
    -- Workflow context and prediction
    workflow_step VARCHAR(50), -- 'doc-load', 'evidence-view', 'timeline', 'analysis', 'report'
    previous_step VARCHAR(50),
    next_step_prediction VARCHAR(50),
    workflow_sequence JSONB DEFAULT '[]', -- Sequence of shader accesses in this workflow
    
    -- Temporal patterns for prediction
    access_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    time_of_day INTEGER CHECK (time_of_day >= 0 AND time_of_day <= 23), -- Hour 0-23
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
    session_duration INTEGER, -- Seconds since session start
    
    -- Performance outcomes
    load_latency_ms INTEGER, -- Time to load shader in milliseconds
    cache_hit BOOLEAN,
    preload_successful BOOLEAN,
    user_satisfaction DECIMAL(3,2) CHECK (user_satisfaction >= -1 AND user_satisfaction <= 1), -- -1 to 1
    
    -- Document and case context
    document_context JSONB DEFAULT '{}', -- Context about what document/case was being viewed
    case_complexity INTEGER CHECK (case_complexity >= 1 AND case_complexity <= 10), -- 1-10 scale
    data_size INTEGER, -- Number of objects being visualized
    
    -- Reinforcement learning features
    state_vector VECTOR(64), -- Compressed workflow state for RL
    action_vector VECTOR(32), -- Action embedding
    reward DECIMAL(7,4), -- Computed reward for this access
    prediction_metadata JSONB DEFAULT '{}', -- ML model prediction data
    actual_outcome JSONB DEFAULT '{}', -- Actual user behavior for training
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Predictive preloading rules learned by the reinforcement system
CREATE TABLE IF NOT EXISTS shader_preload_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Rule identification
    rule_key VARCHAR(255) NOT NULL UNIQUE,
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('sequential', 'conditional', 'temporal', 'similarity', 'user_pattern')),
    
    -- Condition matching
    trigger_conditions JSONB NOT NULL DEFAULT '{}', -- Conditions that trigger this rule
    
    -- Preload specifications
    preload_targets JSONB NOT NULL DEFAULT '[]', -- Shaders to preload when triggered
    
    -- ML model weights and thresholds
    model_weights VECTOR(128), -- Learned weights for this rule
    confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1), -- Rule confidence
    accuracy DECIMAL(5,4) NOT NULL CHECK (accuracy >= 0 AND accuracy <= 1), -- Historical accuracy
    
    -- Performance metrics
    trigger_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    preload_savings_ms INTEGER DEFAULT 0, -- Total time saved by preloading
    
    -- Rule lifecycle and optimization
    active BOOLEAN DEFAULT true,
    learning_rate DECIMAL(6,4) DEFAULT 0.0100, -- Learning rate for rule updates
    last_triggered TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shader dependency graph for intelligent preloading and optimization
CREATE TABLE IF NOT EXISTS shader_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Dependency relationship
    parent_shader_id UUID NOT NULL REFERENCES shader_cache_entries(id),
    child_shader_id UUID NOT NULL REFERENCES shader_cache_entries(id),
    
    -- Dependency metadata
    dependency_type VARCHAR(30) NOT NULL CHECK (dependency_type IN ('include', 'texture', 'uniform', 'buffer', 'function')),
    dependency_strength DECIMAL(5,4) CHECK (dependency_strength >= 0 AND dependency_strength <= 1), -- 0-1 how critical
    load_order INTEGER DEFAULT 100, -- Relative load order (lower = load first)
    
    -- Performance impact
    parallel_load_safe BOOLEAN DEFAULT true,
    load_latency_impact_ms INTEGER,
    
    -- Usage statistics
    co_usage_frequency DECIMAL(5,4), -- 0-1 how often used together
    last_co_used TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent self-dependencies
    CONSTRAINT no_self_dependency CHECK (parent_shader_id != child_shader_id)
);

-- Real-time shader compilation queue for background processing
CREATE TABLE IF NOT EXISTS shader_compilation_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Queue identification
    queue_key VARCHAR(255) NOT NULL UNIQUE,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('immediate', 'high', 'normal', 'low', 'preload')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    
    -- Shader information
    shader_key VARCHAR(255) NOT NULL,
    source_code TEXT NOT NULL,
    shader_type VARCHAR(50) NOT NULL,
    target_gpu VARCHAR(100), -- GPU-specific compilation (e.g., 'RTX3060Ti', 'GTX1660')
    compilation_flags JSONB DEFAULT '{}', -- Compiler flags and options
    
    -- Processing context
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(100),
    workflow_context JSONB DEFAULT '{}',
    
    -- Queue timing
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Processing results
    compilation_result JSONB DEFAULT '{}', -- Results, errors, binaries, etc.
    
    -- Retry logic
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Predictive preload cache for reinforcement learning optimization
CREATE TABLE IF NOT EXISTS shader_preload_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- User and prediction context
    user_id UUID NOT NULL REFERENCES users(id),
    shader_cache_id UUID NOT NULL REFERENCES shader_cache_entries(id),
    
    -- Prediction metadata
    prediction_confidence DECIMAL(5,4) NOT NULL CHECK (prediction_confidence >= 0 AND prediction_confidence <= 1),
    predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    prediction_model VARCHAR(50), -- 'workflow_sequence', 'collaborative_filter', 'content_based'
    
    -- Context for prediction
    current_workflow_step VARCHAR(50),
    user_session_context JSONB DEFAULT '{}',
    legal_case_context JSONB DEFAULT '{}',
    
    -- Priority and scheduling
    preload_priority INTEGER DEFAULT 50 CHECK (preload_priority >= 0 AND preload_priority <= 100),
    scheduled_for TIMESTAMP WITH TIME ZONE,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'loading', 'loaded', 'expired', 'cancelled')),
    preload_started_at TIMESTAMP WITH TIME ZONE,
    preload_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Accuracy tracking for model improvement
    was_used BOOLEAN, -- Did user actually use this shader?
    used_at TIMESTAMP WITH TIME ZONE,
    actual_delay INTEGER, -- Milliseconds between preload and actual use
    
    metadata JSONB DEFAULT '{}'
);

-- ============================================================================
-- INDEXES FOR GPU CACHE SYSTEM
-- ============================================================================

-- Primary shader cache indexes
CREATE INDEX IF NOT EXISTS idx_shader_cache_key ON shader_cache_entries(shader_key);
CREATE INDEX IF NOT EXISTS idx_shader_cache_hash ON shader_cache_entries(shader_hash);
CREATE INDEX IF NOT EXISTS idx_shader_cache_type ON shader_cache_entries(shader_type);
CREATE INDEX IF NOT EXISTS idx_shader_cache_context ON shader_cache_entries(legal_context);
CREATE INDEX IF NOT EXISTS idx_shader_cache_visualization ON shader_cache_entries(visualization_type);
CREATE INDEX IF NOT EXISTS idx_shader_cache_access_count ON shader_cache_entries(access_count);
CREATE INDEX IF NOT EXISTS idx_shader_cache_success_rate ON shader_cache_entries(success_rate);
CREATE INDEX IF NOT EXISTS idx_shader_cache_last_accessed ON shader_cache_entries(last_accessed_at);

-- Semantic search indexes (HNSW for fast similarity search)
CREATE INDEX IF NOT EXISTS idx_shader_source_embedding_hnsw 
    ON shader_cache_entries USING hnsw (source_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- JSONB indexes for metadata search
CREATE INDEX IF NOT EXISTS idx_shader_cache_performance ON shader_cache_entries USING gin(performance_metrics);
CREATE INDEX IF NOT EXISTS idx_shader_cache_reinforcement ON shader_cache_entries USING gin(reinforcement_data);
CREATE INDEX IF NOT EXISTS idx_shader_cache_dependencies ON shader_cache_entries USING gin(dependencies);
CREATE INDEX IF NOT EXISTS idx_shader_cache_parameters ON shader_cache_entries USING gin(shader_parameters);

-- Array indexes for tags
CREATE INDEX IF NOT EXISTS idx_shader_cache_semantic_tags ON shader_cache_entries USING gin(semantic_tags);
CREATE INDEX IF NOT EXISTS idx_shader_cache_user_tags ON shader_cache_entries USING gin(user_tags);

-- User pattern indexes for ML queries
CREATE INDEX IF NOT EXISTS idx_shader_patterns_user ON shader_user_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_shader_patterns_shader ON shader_user_patterns(shader_cache_id);
CREATE INDEX IF NOT EXISTS idx_shader_patterns_session ON shader_user_patterns(session_id);
CREATE INDEX IF NOT EXISTS idx_shader_patterns_workflow ON shader_user_patterns(workflow_step);
CREATE INDEX IF NOT EXISTS idx_shader_patterns_time ON shader_user_patterns(access_timestamp);
CREATE INDEX IF NOT EXISTS idx_shader_patterns_reward ON shader_user_patterns(reward);

-- ML feature indexes
CREATE INDEX IF NOT EXISTS idx_shader_patterns_state_vector 
    ON shader_user_patterns USING hnsw (state_vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_shader_patterns_action_vector 
    ON shader_user_patterns USING hnsw (action_vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_shader_patterns_cache_hit ON shader_user_patterns(cache_hit);
CREATE INDEX IF NOT EXISTS idx_shader_patterns_latency ON shader_user_patterns(load_latency_ms);

-- Composite index for workflow prediction
CREATE INDEX IF NOT EXISTS idx_shader_patterns_workflow_prediction 
    ON shader_user_patterns(user_id, workflow_step, access_timestamp);

-- Preload rule indexes
CREATE INDEX IF NOT EXISTS idx_preload_rules_key ON shader_preload_rules(rule_key);
CREATE INDEX IF NOT EXISTS idx_preload_rules_type ON shader_preload_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_preload_rules_active ON shader_preload_rules(active);
CREATE INDEX IF NOT EXISTS idx_preload_rules_confidence ON shader_preload_rules(confidence);
CREATE INDEX IF NOT EXISTS idx_preload_rules_accuracy ON shader_preload_rules(accuracy);
CREATE INDEX IF NOT EXISTS idx_preload_rules_trigger_count ON shader_preload_rules(trigger_count);
CREATE INDEX IF NOT EXISTS idx_preload_rules_last_triggered ON shader_preload_rules(last_triggered);

-- ML model index for rules
CREATE INDEX IF NOT EXISTS idx_preload_rules_model_weights 
    ON shader_preload_rules USING hnsw (model_weights vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- JSONB indexes for rule conditions
CREATE INDEX IF NOT EXISTS idx_preload_rules_conditions ON shader_preload_rules USING gin(trigger_conditions);
CREATE INDEX IF NOT EXISTS idx_preload_rules_targets ON shader_preload_rules USING gin(preload_targets);

-- Dependency indexes
CREATE INDEX IF NOT EXISTS idx_shader_deps_parent ON shader_dependencies(parent_shader_id);
CREATE INDEX IF NOT EXISTS idx_shader_deps_child ON shader_dependencies(child_shader_id);
CREATE INDEX IF NOT EXISTS idx_shader_deps_type ON shader_dependencies(dependency_type);
CREATE INDEX IF NOT EXISTS idx_shader_deps_strength ON shader_dependencies(dependency_strength);
CREATE INDEX IF NOT EXISTS idx_shader_deps_load_order ON shader_dependencies(load_order);
CREATE INDEX IF NOT EXISTS idx_shader_deps_frequency ON shader_dependencies(co_usage_frequency);

-- Unique constraint for dependencies
CREATE UNIQUE INDEX IF NOT EXISTS idx_shader_deps_unique 
    ON shader_dependencies(parent_shader_id, child_shader_id);

-- Compilation queue indexes
CREATE INDEX IF NOT EXISTS idx_compilation_queue_key ON shader_compilation_queue(queue_key);
CREATE INDEX IF NOT EXISTS idx_compilation_queue_status ON shader_compilation_queue(status);
CREATE INDEX IF NOT EXISTS idx_compilation_queue_priority ON shader_compilation_queue(priority);
CREATE INDEX IF NOT EXISTS idx_compilation_queue_queued_at ON shader_compilation_queue(queued_at);
CREATE INDEX IF NOT EXISTS idx_compilation_queue_user_session ON shader_compilation_queue(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_compilation_queue_retry ON shader_compilation_queue(next_retry_at);

-- Composite indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_compilation_queue_processing 
    ON shader_compilation_queue(status, priority, queued_at);
CREATE INDEX IF NOT EXISTS idx_compilation_queue_pending 
    ON shader_compilation_queue(status, priority, queued_at) 
    WHERE status = 'pending';

-- Preload queue indexes
CREATE INDEX IF NOT EXISTS idx_preload_queue_user ON shader_preload_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_preload_queue_shader ON shader_preload_queue(shader_cache_id);
CREATE INDEX IF NOT EXISTS idx_preload_queue_confidence ON shader_preload_queue(prediction_confidence);
CREATE INDEX IF NOT EXISTS idx_preload_queue_priority ON shader_preload_queue(preload_priority);
CREATE INDEX IF NOT EXISTS idx_preload_queue_status ON shader_preload_queue(status);
CREATE INDEX IF NOT EXISTS idx_preload_queue_scheduled ON shader_preload_queue(scheduled_for);

-- Composite indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_preload_queue_processing 
    ON shader_preload_queue(status, scheduled_for, preload_priority);
CREATE INDEX IF NOT EXISTS idx_preload_queue_accuracy_tracking 
    ON shader_preload_queue(was_used, prediction_model);

-- ============================================================================
-- GPU CACHE FUNCTIONS
-- ============================================================================

-- Function to find similar shaders by source code
CREATE OR REPLACE FUNCTION find_similar_shaders(
    query_embedding vector(384),
    similarity_threshold real DEFAULT 0.7,
    max_results integer DEFAULT 10
)
RETURNS TABLE (
    shader_id uuid,
    shader_key varchar,
    similarity real,
    shader_type varchar,
    legal_context varchar
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.shader_key,
        1 - (s.source_embedding <=> query_embedding) AS similarity,
        s.shader_type,
        s.legal_context
    FROM shader_cache_entries s
    WHERE s.source_embedding IS NOT NULL
        AND 1 - (s.source_embedding <=> query_embedding) >= similarity_threshold
    ORDER BY s.source_embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Function to get shader recommendations for a user
CREATE OR REPLACE FUNCTION get_shader_recommendations(
    p_user_id uuid,
    p_current_workflow varchar DEFAULT NULL,
    p_limit integer DEFAULT 5
)
RETURNS TABLE (
    shader_id uuid,
    shader_key varchar,
    recommendation_score real,
    recommendation_reason text
) AS $$
BEGIN
    RETURN QUERY
    WITH user_patterns AS (
        SELECT 
            sup.shader_cache_id,
            COUNT(*) as usage_count,
            AVG(sup.user_satisfaction) as avg_satisfaction,
            AVG(sup.reward) as avg_reward
        FROM shader_user_patterns sup
        WHERE sup.user_id = p_user_id
            AND (p_current_workflow IS NULL OR sup.workflow_step = p_current_workflow)
            AND sup.access_timestamp > NOW() - INTERVAL '30 days'
        GROUP BY sup.shader_cache_id
    ),
    shader_scores AS (
        SELECT 
            s.id,
            s.shader_key,
            COALESCE(up.usage_count, 0) * 0.3 +
            COALESCE(up.avg_satisfaction, 0) * 0.4 +
            COALESCE(up.avg_reward, 0) * 0.2 +
            (s.access_count / 1000.0) * 0.1 as score,
            CASE 
                WHEN up.usage_count > 0 THEN 'Previously used with good results'
                WHEN s.access_count > 100 THEN 'Popular shader'
                ELSE 'Recommended based on context'
            END as reason
        FROM shader_cache_entries s
        LEFT JOIN user_patterns up ON s.id = up.shader_cache_id
        WHERE s.deprecated = false
    )
    SELECT 
        ss.id,
        ss.shader_key,
        ss.score,
        ss.reason
    FROM shader_scores ss
    ORDER BY ss.score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update shader access statistics
CREATE OR REPLACE FUNCTION update_shader_access_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE shader_cache_entries 
    SET 
        access_count = access_count + 1,
        last_accessed_at = NOW()
    WHERE id = NEW.shader_cache_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_shader_access_stats
    AFTER INSERT ON shader_user_patterns
    FOR EACH ROW EXECUTE FUNCTION update_shader_access_stats();

-- Triggers for updated_at columns
CREATE TRIGGER update_shader_cache_entries_updated_at 
    BEFORE UPDATE ON shader_cache_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shader_dependencies_updated_at 
    BEFORE UPDATE ON shader_dependencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shader_compilation_queue_updated_at 
    BEFORE UPDATE ON shader_compilation_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration completed
SELECT 'Migration 002_gpu_cache_system.sql completed successfully' AS status;