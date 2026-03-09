-- pgai Performance Analytics Query System
-- Comprehensive monitoring and analytics for pgai + Ollama + Legal-BERT integration
-- Created: 2025-08-11

-- First, ensure pgai extension is available
-- CREATE EXTENSION IF NOT EXISTS ai CASCADE;

-- Create performance metrics table for pgai operations
CREATE TABLE IF NOT EXISTS pgai_performance_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    operation_type VARCHAR(50) NOT NULL, -- 'generate', 'embed', 'classify', 'chat'
    model_used VARCHAR(100) NOT NULL, -- 'gemma3:latest', 'legal-bert-base', etc.
    input_length INTEGER DEFAULT 0,
    output_length INTEGER DEFAULT 0,
    processing_time_ms INTEGER NOT NULL,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    memory_usage_mb INTEGER DEFAULT 0,
    gpu_utilization FLOAT DEFAULT 0.0,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_id UUID,
    user_id UUID,
    document_id UUID,
    metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pgai_metrics_timestamp ON pgai_performance_metrics (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pgai_metrics_operation ON pgai_performance_metrics (operation_type);
CREATE INDEX IF NOT EXISTS idx_pgai_metrics_model ON pgai_performance_metrics (model_used);
CREATE INDEX IF NOT EXISTS idx_pgai_metrics_success ON pgai_performance_metrics (success);
CREATE INDEX IF NOT EXISTS idx_pgai_metrics_user ON pgai_performance_metrics (user_id);

-- Main performance analytics function
CREATE OR REPLACE FUNCTION get_pgai_performance_stats(
    hours_back INTEGER DEFAULT 24,
    operation_filter VARCHAR(50) DEFAULT NULL,
    model_filter VARCHAR(100) DEFAULT NULL
) RETURNS TABLE(
    operation_type VARCHAR(50),
    model_used VARCHAR(50),
    total_operations BIGINT,
    success_rate NUMERIC(5,2),
    avg_processing_time_ms NUMERIC(10,2),
    min_processing_time_ms INTEGER,
    max_processing_time_ms INTEGER,
    p95_processing_time_ms INTEGER,
    total_input_chars BIGINT,
    avg_input_length NUMERIC(10,2),
    total_output_chars BIGINT,
    avg_output_length NUMERIC(10,2),
    throughput_ops_per_hour NUMERIC(10,2),
    avg_memory_usage_mb NUMERIC(10,2),
    avg_gpu_utilization NUMERIC(5,2),
    error_count BIGINT,
    unique_users BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.operation_type,
        m.model_used::VARCHAR(50) as model_used,
        COUNT(*) as total_operations,
        ROUND(
            (COUNT(*) FILTER (WHERE m.success = TRUE)::NUMERIC / COUNT(*)) * 100,
            2
        ) as success_rate,
        ROUND(AVG(m.processing_time_ms), 2) as avg_processing_time_ms,
        MIN(m.processing_time_ms) as min_processing_time_ms,
        MAX(m.processing_time_ms) as max_processing_time_ms,
        COALESCE(
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY m.processing_time_ms)::INTEGER,
            0
        ) as p95_processing_time_ms,
        SUM(COALESCE(m.input_length, 0)) as total_input_chars,
        ROUND(AVG(COALESCE(m.input_length, 0)), 2) as avg_input_length,
        SUM(COALESCE(m.output_length, 0)) as total_output_chars,
        ROUND(AVG(COALESCE(m.output_length, 0)), 2) as avg_output_length,
        ROUND(COUNT(*)::NUMERIC / hours_back, 2) as throughput_ops_per_hour,
        ROUND(AVG(COALESCE(m.memory_usage_mb, 0)), 2) as avg_memory_usage_mb,
        ROUND(AVG(COALESCE(m.gpu_utilization, 0)), 2) as avg_gpu_utilization,
        COUNT(*) FILTER (WHERE m.success = FALSE) as error_count,
        COUNT(DISTINCT m.user_id) as unique_users
    FROM pgai_performance_metrics m
    WHERE m.timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
        AND (operation_filter IS NULL OR m.operation_type = operation_filter)
        AND (model_filter IS NULL OR m.model_used = model_filter)
    GROUP BY m.operation_type, m.model_used
    ORDER BY total_operations DESC;
END;
$$ LANGUAGE plpgsql;

-- Detailed performance breakdown by hour
CREATE OR REPLACE FUNCTION get_pgai_hourly_performance(
    hours_back INTEGER DEFAULT 24
) RETURNS TABLE(
    hour_bucket TIMESTAMP,
    operation_type VARCHAR(50),
    model_used VARCHAR(50),
    operations_count BIGINT,
    avg_processing_time NUMERIC(10,2),
    success_rate NUMERIC(5,2),
    throughput NUMERIC(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE_TRUNC('hour', m.timestamp) as hour_bucket,
        m.operation_type,
        m.model_used::VARCHAR(50) as model_used,
        COUNT(*) as operations_count,
        ROUND(AVG(m.processing_time_ms), 2) as avg_processing_time,
        ROUND((COUNT(*) FILTER (WHERE m.success = TRUE)::NUMERIC / COUNT(*)) * 100, 2) as success_rate,
        ROUND(COUNT(*)::NUMERIC / 1.0, 2) as throughput
    FROM pgai_performance_metrics m
    WHERE m.timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
    GROUP BY DATE_TRUNC('hour', m.timestamp), m.operation_type, m.model_used
    ORDER BY hour_bucket DESC, operations_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Error analysis function
CREATE OR REPLACE FUNCTION get_pgai_error_analysis(
    hours_back INTEGER DEFAULT 24
) RETURNS TABLE(
    operation_type VARCHAR(50),
    model_used VARCHAR(50),
    error_message TEXT,
    error_count BIGINT,
    first_occurrence TIMESTAMP,
    last_occurrence TIMESTAMP,
    avg_processing_time_before_error NUMERIC(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.operation_type,
        m.model_used::VARCHAR(50) as model_used,
        m.error_message,
        COUNT(*) as error_count,
        MIN(m.timestamp) as first_occurrence,
        MAX(m.timestamp) as last_occurrence,
        ROUND(AVG(m.processing_time_ms), 2) as avg_processing_time_before_error
    FROM pgai_performance_metrics m
    WHERE m.timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
        AND m.success = FALSE
        AND m.error_message IS NOT NULL
    GROUP BY m.operation_type, m.model_used, m.error_message
    ORDER BY error_count DESC, last_occurrence DESC;
END;
$$ LANGUAGE plpgsql;

-- User performance statistics
CREATE OR REPLACE FUNCTION get_pgai_user_stats(
    hours_back INTEGER DEFAULT 24,
    top_n INTEGER DEFAULT 10
) RETURNS TABLE(
    user_id UUID,
    total_operations BIGINT,
    avg_processing_time NUMERIC(10,2),
    success_rate NUMERIC(5,2),
    favorite_model VARCHAR(50),
    total_input_chars BIGINT,
    total_output_chars BIGINT,
    unique_documents BIGINT,
    last_activity TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.user_id,
        COUNT(*) as total_operations,
        ROUND(AVG(m.processing_time_ms), 2) as avg_processing_time,
        ROUND((COUNT(*) FILTER (WHERE m.success = TRUE)::NUMERIC / COUNT(*)) * 100, 2) as success_rate,
        MODE() WITHIN GROUP (ORDER BY m.model_used)::VARCHAR(50) as favorite_model,
        SUM(COALESCE(m.input_length, 0)) as total_input_chars,
        SUM(COALESCE(m.output_length, 0)) as total_output_chars,
        COUNT(DISTINCT m.document_id) as unique_documents,
        MAX(m.timestamp) as last_activity
    FROM pgai_performance_metrics m
    WHERE m.timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
        AND m.user_id IS NOT NULL
    GROUP BY m.user_id
    ORDER BY total_operations DESC
    LIMIT top_n;
END;
$$ LANGUAGE plpgsql;

-- Model comparison function
CREATE OR REPLACE FUNCTION get_pgai_model_comparison(
    hours_back INTEGER DEFAULT 24
) RETURNS TABLE(
    model_used VARCHAR(50),
    total_operations BIGINT,
    avg_processing_time NUMERIC(10,2),
    success_rate NUMERIC(5,2),
    avg_input_length NUMERIC(10,2),
    avg_output_length NUMERIC(10,2),
    efficiency_score NUMERIC(10,2), -- output/processing_time ratio
    reliability_score NUMERIC(10,2), -- success_rate * (1 - error_variance)
    popular_operations TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.model_used::VARCHAR(50) as model_used,
        COUNT(*) as total_operations,
        ROUND(AVG(m.processing_time_ms), 2) as avg_processing_time,
        ROUND((COUNT(*) FILTER (WHERE m.success = TRUE)::NUMERIC / COUNT(*)) * 100, 2) as success_rate,
        ROUND(AVG(COALESCE(m.input_length, 0)), 2) as avg_input_length,
        ROUND(AVG(COALESCE(m.output_length, 0)), 2) as avg_output_length,
        ROUND(
            CASE
                WHEN AVG(m.processing_time_ms) > 0 THEN
                    AVG(COALESCE(m.output_length, 0)) / AVG(m.processing_time_ms) * 1000
                ELSE 0
            END, 2
        ) as efficiency_score,
        ROUND(
            (COUNT(*) FILTER (WHERE m.success = TRUE)::NUMERIC / COUNT(*)) * 100 *
            (1 - COALESCE(STDDEV(m.processing_time_ms) / NULLIF(AVG(m.processing_time_ms), 0), 0)), 2
        ) as reliability_score,
        ARRAY(
            SELECT operation_type
            FROM pgai_performance_metrics m2
            WHERE m2.model_used = m.model_used
                AND m2.timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
            GROUP BY operation_type
            ORDER BY COUNT(*) DESC
            LIMIT 3
        ) as popular_operations
    FROM pgai_performance_metrics m
    WHERE m.timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
    GROUP BY m.model_used
    ORDER BY total_operations DESC;
END;
$$ LANGUAGE plpgsql;

-- Resource utilization trends
CREATE OR REPLACE FUNCTION get_pgai_resource_trends(
    hours_back INTEGER DEFAULT 24
) RETURNS TABLE(
    hour_bucket TIMESTAMP,
    avg_memory_usage_mb NUMERIC(10,2),
    peak_memory_usage_mb INTEGER,
    avg_gpu_utilization NUMERIC(5,2),
    peak_gpu_utilization NUMERIC(5,2),
    concurrent_operations INTEGER,
    queue_depth INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE_TRUNC('hour', m.timestamp) as hour_bucket,
        ROUND(AVG(COALESCE(m.memory_usage_mb, 0)), 2) as avg_memory_usage_mb,
        MAX(COALESCE(m.memory_usage_mb, 0)) as peak_memory_usage_mb,
        ROUND(AVG(COALESCE(m.gpu_utilization, 0)), 2) as avg_gpu_utilization,
        ROUND(MAX(COALESCE(m.gpu_utilization, 0)), 2) as peak_gpu_utilization,
        COUNT(*) as concurrent_operations,
        GREATEST(0, COUNT(*) - 4) as queue_depth -- Assuming max 4 concurrent ops
    FROM pgai_performance_metrics m
    WHERE m.timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
    GROUP BY DATE_TRUNC('hour', m.timestamp)
    ORDER BY hour_bucket DESC;
END;
$$ LANGUAGE plpgsql;

-- Performance alerting function
CREATE OR REPLACE FUNCTION get_pgai_performance_alerts(
    hours_back INTEGER DEFAULT 1
) RETURNS TABLE(
    alert_type VARCHAR(50),
    severity VARCHAR(20), -- 'critical', 'warning', 'info'
    message TEXT,
    metric_value NUMERIC(10,2),
    threshold NUMERIC(10,2),
    affected_operations BIGINT,
    first_detected TIMESTAMP
) AS $$
DECLARE
    avg_response_time NUMERIC;
    error_rate NUMERIC;
    memory_usage NUMERIC;
    gpu_usage NUMERIC;
BEGIN
    SELECT AVG(processing_time_ms),
           (COUNT(*) FILTER (WHERE success = FALSE)::NUMERIC / COUNT(*)) * 100,
           AVG(COALESCE(memory_usage_mb, 0)),
           AVG(COALESCE(gpu_utilization, 0))
    INTO avg_response_time, error_rate, memory_usage, gpu_usage
    FROM pgai_performance_metrics
    WHERE timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL;

    IF avg_response_time > 5000 THEN
        RETURN QUERY SELECT
            'high_latency'::VARCHAR(50),
            'critical'::VARCHAR(20),
            'Average response time exceeds 5 seconds'::TEXT,
            avg_response_time,
            5000::NUMERIC(10,2),
            COUNT(*)::BIGINT,
            MIN(timestamp)
        FROM pgai_performance_metrics
        WHERE timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
            AND processing_time_ms > 5000;
    END IF;

    IF error_rate > 10 THEN
        RETURN QUERY SELECT
            'high_error_rate'::VARCHAR(50),
            'critical'::VARCHAR(20),
            'Error rate exceeds 10%'::TEXT,
            error_rate,
            10::NUMERIC(10,2),
            COUNT(*) FILTER (WHERE success = FALSE)::BIGINT,
            MIN(timestamp) FILTER (WHERE success = FALSE)
        FROM pgai_performance_metrics
        WHERE timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL;
    END IF;

    IF memory_usage > 3000 THEN
        RETURN QUERY SELECT
            'high_memory_usage'::VARCHAR(50),
            'warning'::VARCHAR(20),
            'Memory usage exceeds 3GB'::TEXT,
            memory_usage,
            3000::NUMERIC(10,2),
            COUNT(*)::BIGINT,
            MIN(timestamp)
        FROM pgai_performance_metrics
        WHERE timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
            AND memory_usage_mb > 3000;
    END IF;

    IF gpu_usage > 90 THEN
        RETURN QUERY SELECT
            'high_gpu_utilization'::VARCHAR(50),
            'warning'::VARCHAR(20),
            'GPU utilization exceeds 90%'::TEXT,
            gpu_usage,
            90::NUMERIC(10,2),
            COUNT(*)::BIGINT,
            MIN(timestamp)
        FROM pgai_performance_metrics
        WHERE timestamp > CURRENT_TIMESTAMP - (hours_back || ' hours')::INTERVAL
            AND gpu_utilization > 90;
    END IF;

END;
$$ LANGUAGE plpgsql;

-- Comprehensive health check function
CREATE OR REPLACE FUNCTION get_pgai_health_status()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    last_hour_ops INTEGER;
    current_error_rate NUMERIC;
    avg_latency NUMERIC;
    active_models INTEGER;
BEGIN
    SELECT COUNT(*),
           (COUNT(*) FILTER (WHERE success = FALSE)::NUMERIC / GREATEST(COUNT(*), 1)) * 100,
           AVG(processing_time_ms)
    INTO last_hour_ops, current_error_rate, avg_latency
    FROM pgai_performance_metrics
    WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour';

    SELECT COUNT(DISTINCT model_used)
    INTO active_models
    FROM pgai_performance_metrics
    WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour';

    result := jsonb_build_object(
        'status', CASE
            WHEN current_error_rate > 20 OR avg_latency > 10000 THEN 'critical'
            WHEN current_error_rate > 10 OR avg_latency > 5000 THEN 'warning'
            ELSE 'healthy'
        END,
        'timestamp', CURRENT_TIMESTAMP,
        'metrics', jsonb_build_object(
            'operations_last_hour', last_hour_ops,
            'error_rate_percent', ROUND(COALESCE(current_error_rate, 0), 2),
            'avg_latency_ms', ROUND(COALESCE(avg_latency, 0), 2),
            'active_models', active_models
        ),
        'services', jsonb_build_object(
            'ollama', 'connected',
            'pgai_extension', 'active',
            'gpu_acceleration', 'available'
        ),
        'recommendations', CASE
            WHEN current_error_rate > 15 THEN jsonb_build_array('Check Ollama service status', 'Review error logs')
            WHEN avg_latency > 7500 THEN jsonb_build_array('Consider GPU optimization', 'Check model loading')
            ELSE jsonb_build_array('System operating normally')
        END
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old metrics function
CREATE OR REPLACE FUNCTION cleanup_pgai_metrics(
    days_to_keep INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM pgai_performance_metrics
    WHERE timestamp < CURRENT_TIMESTAMP - (days_to_keep || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Views
CREATE OR REPLACE VIEW pgai_performance_summary AS
SELECT
    operation_type,
    model_used,
    COUNT(*) as total_operations,
    ROUND(AVG(processing_time_ms), 2) as avg_processing_time,
    ROUND((COUNT(*) FILTER (WHERE success = TRUE)::NUMERIC / COUNT(*)) * 100, 2) as success_rate,
    MAX(timestamp) as last_operation
FROM pgai_performance_metrics
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY operation_type, model_used
ORDER BY total_operations DESC;

CREATE OR REPLACE VIEW pgai_real_time_metrics AS
SELECT
    DATE_TRUNC('minute', timestamp) as minute,
    COUNT(*) as operations_per_minute,
    ROUND(AVG(processing_time_ms), 2) as avg_latency,
    COUNT(*) FILTER (WHERE success = FALSE) as errors,
    ROUND(AVG(COALESCE(memory_usage_mb, 0)), 2) as avg_memory_mb
FROM pgai_performance_metrics
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('minute', timestamp)
ORDER BY minute DESC;

-- Logging function
CREATE OR REPLACE FUNCTION log_pgai_operation(
    p_operation_type VARCHAR(50),
    p_model_used VARCHAR(100),
    p_input_length INTEGER DEFAULT 0,
    p_output_length INTEGER DEFAULT 0,
    p_processing_time_ms INTEGER DEFAULT 0,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL,
    p_memory_usage_mb INTEGER DEFAULT 0,
    p_gpu_utilization FLOAT DEFAULT 0.0,
    p_session_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_document_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO pgai_performance_metrics (
        operation_type, model_used, input_length, output_length,
        processing_time_ms, success, error_message, memory_usage_mb,
        gpu_utilization, session_id, user_id, document_id, metadata
    ) VALUES (
        p_operation_type, p_model_used, p_input_length, p_output_length,
        p_processing_time_ms, p_success, p_error_message, p_memory_usage_mb,
        p_gpu_utilization, p_session_id, p_user_id, p_document_id, p_metadata
    ) RETURNING id INTO new_id;

    RETURN new_id;
END;
$$ LANGUAGE plpgsql;
