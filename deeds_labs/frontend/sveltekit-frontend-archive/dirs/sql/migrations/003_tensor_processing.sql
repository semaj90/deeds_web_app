-- Legal AI Platform - Tensor Processing & Neural Network Integration
-- Creates tensor metadata tables for gRPC streaming, Redis caching, and neural processing
-- Integrates with Go tensor service and neural sprite autoencoder
-- Generated: 2025-09-06

-- ============================================================================
-- TENSOR METADATA AND PROCESSING
-- ============================================================================

-- Tensor metadata table for gRPC tensor service integration
CREATE TABLE IF NOT EXISTS tensor_metadata (
    id VARCHAR(255) PRIMARY KEY, -- Tensor ID from gRPC service
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Model and processing information
    model_name VARCHAR(255) NOT NULL, -- e.g., 'legal-embeddings-v1', 'neural-sprite-v2'
    data_type VARCHAR(50) NOT NULL DEFAULT 'float32', -- 'float32', 'int8', 'int16', etc.
    shape INTEGER[] NOT NULL, -- Tensor dimensions [batch, height, width, channels] or [batch, features]
    
    -- Tensor manifest and metadata
    manifest JSONB NOT NULL, -- Full tensor manifest from gRPC
    processing_metadata JSONB DEFAULT '{}', -- Processing parameters, compression settings
    
    -- Vector embedding for similarity search (384 dimensions)
    embedding VECTOR(384),
    
    -- Caching and storage information
    cache_key VARCHAR(255) UNIQUE NOT NULL, -- Redis cache key
    redis_cached BOOLEAN DEFAULT false,
    cache_hit_count INTEGER DEFAULT 0,
    cache_ttl_seconds INTEGER DEFAULT 86400, -- 24 hours default TTL
    
    -- MinIO storage for large tensors
    minio_path TEXT, -- MinIO object path for tensor data
    minio_bucket VARCHAR(100) DEFAULT 'tensors',
    
    -- Size and performance metrics
    size_bytes BIGINT NOT NULL DEFAULT 0,
    chunk_count INTEGER DEFAULT 1,
    compression_ratio REAL, -- Original size / compressed size
    processing_time_ms REAL, -- Time to process tensor
    
    -- Quality and validation metrics
    data_integrity_hash VARCHAR(64), -- SHA-256 hash of tensor data
    validation_score REAL DEFAULT 0.5, -- 0-1 data quality score
    error_count INTEGER DEFAULT 0,
    
    -- Legal context and classification
    legal_document_id UUID REFERENCES legal_documents(id), -- Associated document if applicable
    tensor_purpose VARCHAR(100), -- 'embedding', 'classification', 'generation', 'visualization'
    legal_context VARCHAR(100), -- 'case_analysis', 'document_review', 'evidence_processing'
    
    -- Access control and privacy
    confidentiality_level VARCHAR(20) DEFAULT 'internal' CHECK (confidentiality_level IN ('public', 'internal', 'confidential', 'restricted')),
    
    -- Lifecycle and status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted', 'processing', 'failed')),
    expires_at TIMESTAMP WITH TIME ZONE, -- When to expire/delete
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE
);

-- Tensor processing jobs for background and batch processing
CREATE TABLE IF NOT EXISTS tensor_processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Job identification and priority
    job_name VARCHAR(255) NOT NULL,
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('embedding', 'classification', 'similarity', 'preprocessing', 'neural_sprite')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    
    -- User and context
    user_id UUID NOT NULL REFERENCES users(id),
    session_id VARCHAR(100),
    
    -- Input data and parameters
    input_tensors JSONB NOT NULL DEFAULT '[]', -- Array of input tensor IDs
    processing_parameters JSONB DEFAULT '{}', -- Model parameters, thresholds, etc.
    
    -- Output and results
    output_tensors JSONB DEFAULT '[]', -- Array of output tensor IDs
    result_metadata JSONB DEFAULT '{}', -- Processing results, metrics
    
    -- Job status and progress
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    
    -- Timing and performance
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    processing_time_ms INTEGER,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Resource usage
    gpu_memory_used INTEGER, -- GPU memory in bytes
    cpu_memory_used INTEGER, -- CPU memory in bytes
    gpu_utilization REAL, -- 0-1 GPU utilization
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Neural network models registry and versioning
CREATE TABLE IF NOT EXISTS neural_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Model identification
    model_name VARCHAR(255) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    model_type VARCHAR(50) NOT NULL CHECK (model_type IN ('autoencoder', 'classifier', 'embedding', 'gan', 'transformer')),
    
    -- Model metadata and configuration
    architecture JSONB NOT NULL, -- Model architecture definition
    hyperparameters JSONB DEFAULT '{}', -- Training hyperparameters
    model_size_bytes BIGINT,
    parameter_count BIGINT,
    
    -- Model file storage
    model_file_path TEXT, -- MinIO path to model file
    checkpoint_path TEXT, -- Latest checkpoint
    config_file_path TEXT, -- Model configuration file
    
    -- Training information
    dataset_info JSONB DEFAULT '{}', -- Training dataset information
    training_metrics JSONB DEFAULT '{}', -- Loss, accuracy, etc.
    validation_metrics JSONB DEFAULT '{}', -- Validation scores
    
    -- Performance benchmarks
    inference_time_ms REAL, -- Average inference time
    throughput_samples_sec REAL, -- Samples processed per second
    gpu_memory_required INTEGER, -- GPU memory needed for inference
    
    -- Model status and deployment
    status VARCHAR(20) DEFAULT 'training' CHECK (status IN ('training', 'trained', 'deployed', 'deprecated', 'archived')),
    is_active BOOLEAN DEFAULT true,
    deployment_endpoint TEXT, -- API endpoint if deployed
    
    -- Legal and compliance
    model_purpose TEXT, -- What this model is used for
    legal_compliance JSONB DEFAULT '{}', -- Compliance information
    bias_metrics JSONB DEFAULT '{}', -- Bias and fairness metrics
    
    -- Version control
    parent_model_id UUID REFERENCES neural_models(id), -- Parent model if this is a fine-tune
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(model_name, model_version)
);

-- Model training history and experiments
CREATE TABLE IF NOT EXISTS model_training_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES neural_models(id),
    
    -- Training run information
    experiment_name VARCHAR(255),
    training_config JSONB NOT NULL,
    
    -- Training progress
    epoch INTEGER NOT NULL,
    step INTEGER NOT NULL,
    
    -- Metrics at this checkpoint
    training_loss REAL,
    validation_loss REAL,
    training_accuracy REAL,
    validation_accuracy REAL,
    custom_metrics JSONB DEFAULT '{}',
    
    -- Resource usage during training
    training_time_seconds INTEGER,
    gpu_memory_used INTEGER,
    
    -- Model checkpoint
    checkpoint_path TEXT,
    model_state_hash VARCHAR(64), -- Hash of model weights
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vector similarity search results cache
CREATE TABLE IF NOT EXISTS similarity_search_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Query information
    query_hash VARCHAR(64) NOT NULL, -- Hash of query vector and parameters
    query_vector VECTOR(384),
    search_parameters JSONB DEFAULT '{}', -- Threshold, max results, filters
    
    -- Results
    results JSONB NOT NULL, -- Array of similar items with scores
    result_count INTEGER NOT NULL,
    
    -- Performance metrics
    search_time_ms REAL,
    cache_hit BOOLEAN DEFAULT false,
    
    -- Cache management
    access_count INTEGER DEFAULT 1,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour'),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- NEURAL SPRITE AUTOENCODER INTEGRATION
-- ============================================================================

-- Neural sprite data for legal document visualization
CREATE TABLE IF NOT EXISTS neural_sprites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES legal_documents(id),
    
    -- Sprite identification
    sprite_name VARCHAR(255) NOT NULL,
    sprite_type VARCHAR(50) DEFAULT 'visualization' CHECK (sprite_type IN ('visualization', 'icon', 'pattern', 'texture')),
    
    -- Original data and compressed representation
    original_data JSONB, -- Original high-dimensional data
    latent_representation VECTOR(16), -- 16-dimensional compressed representation
    reconstruction_data JSONB, -- Reconstructed data from latent space
    
    -- Quality metrics
    compression_ratio REAL, -- Original size / latent size
    reconstruction_fidelity REAL, -- How well it reconstructs (0-1)
    visual_quality_score REAL, -- Perceptual quality score
    
    -- Sprite parameters
    dimensions INTEGER[] DEFAULT '{64, 64}', -- Width, height in pixels
    color_palette JSONB DEFAULT '{}', -- Color information
    animation_frames INTEGER DEFAULT 1,
    
    -- Usage in legal context
    legal_context VARCHAR(100), -- 'timeline', 'network', 'evidence', 'document'
    visualization_layer VARCHAR(50), -- Which layer of visualization this represents
    
    -- Processing metadata
    autoencoder_model_id UUID REFERENCES neural_models(id),
    processing_parameters JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR TENSOR PROCESSING
-- ============================================================================

-- Tensor metadata indexes
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_user_id ON tensor_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_model_name ON tensor_metadata(model_name);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_cache_key ON tensor_metadata(cache_key);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_purpose ON tensor_metadata(tensor_purpose);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_context ON tensor_metadata(legal_context);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_status ON tensor_metadata(status);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_document ON tensor_metadata(legal_document_id);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_size ON tensor_metadata(size_bytes);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_created ON tensor_metadata(created_at);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_accessed ON tensor_metadata(last_accessed_at);

-- Vector similarity search index
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_embedding_hnsw 
    ON tensor_metadata USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_manifest ON tensor_metadata USING gin(manifest);
CREATE INDEX IF NOT EXISTS idx_tensor_metadata_processing ON tensor_metadata USING gin(processing_metadata);

-- Processing jobs indexes
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_user ON tensor_processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_type ON tensor_processing_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_status ON tensor_processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_priority ON tensor_processing_jobs(priority);
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_queued ON tensor_processing_jobs(queued_at);
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_session ON tensor_processing_jobs(session_id);

-- Composite index for job queue processing
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_queue 
    ON tensor_processing_jobs(status, priority, queued_at)
    WHERE status IN ('pending', 'running');

-- JSONB indexes for job data
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_input ON tensor_processing_jobs USING gin(input_tensors);
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_output ON tensor_processing_jobs USING gin(output_tensors);
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_params ON tensor_processing_jobs USING gin(processing_parameters);
CREATE INDEX IF NOT EXISTS idx_tensor_jobs_results ON tensor_processing_jobs USING gin(result_metadata);

-- Neural models indexes
CREATE INDEX IF NOT EXISTS idx_neural_models_name ON neural_models(model_name);
CREATE INDEX IF NOT EXISTS idx_neural_models_version ON neural_models(model_name, model_version);
CREATE INDEX IF NOT EXISTS idx_neural_models_type ON neural_models(model_type);
CREATE INDEX IF NOT EXISTS idx_neural_models_status ON neural_models(status);
CREATE INDEX IF NOT EXISTS idx_neural_models_active ON neural_models(is_active);
CREATE INDEX IF NOT EXISTS idx_neural_models_created_by ON neural_models(created_by);
CREATE INDEX IF NOT EXISTS idx_neural_models_parent ON neural_models(parent_model_id);

-- Model training history indexes
CREATE INDEX IF NOT EXISTS idx_model_training_model ON model_training_history(model_id);
CREATE INDEX IF NOT EXISTS idx_model_training_experiment ON model_training_history(experiment_name);
CREATE INDEX IF NOT EXISTS idx_model_training_epoch ON model_training_history(model_id, epoch, step);
CREATE INDEX IF NOT EXISTS idx_model_training_created ON model_training_history(created_at);

-- Similarity search cache indexes
CREATE INDEX IF NOT EXISTS idx_similarity_cache_hash ON similarity_search_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_similarity_cache_vector_hnsw 
    ON similarity_search_cache USING hnsw (query_vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_similarity_cache_expires ON similarity_search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_similarity_cache_accessed ON similarity_search_cache(last_accessed_at);

-- Neural sprites indexes
CREATE INDEX IF NOT EXISTS idx_neural_sprites_document ON neural_sprites(document_id);
CREATE INDEX IF NOT EXISTS idx_neural_sprites_type ON neural_sprites(sprite_type);
CREATE INDEX IF NOT EXISTS idx_neural_sprites_context ON neural_sprites(legal_context);
CREATE INDEX IF NOT EXISTS idx_neural_sprites_model ON neural_sprites(autoencoder_model_id);

-- Latent space similarity search
CREATE INDEX IF NOT EXISTS idx_neural_sprites_latent_hnsw 
    ON neural_sprites USING hnsw (latent_representation vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- TENSOR PROCESSING FUNCTIONS
-- ============================================================================

-- Function to find similar tensors by embedding
CREATE OR REPLACE FUNCTION find_similar_tensors(
    query_embedding vector(384),
    similarity_threshold real DEFAULT 0.7,
    max_results integer DEFAULT 10,
    tensor_purpose varchar DEFAULT NULL
)
RETURNS TABLE (
    tensor_id varchar,
    model_name varchar,
    similarity real,
    tensor_purpose varchar,
    legal_context varchar
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.model_name,
        1 - (t.embedding <=> query_embedding) AS similarity,
        t.tensor_purpose,
        t.legal_context
    FROM tensor_metadata t
    WHERE t.embedding IS NOT NULL
        AND t.status = 'active'
        AND 1 - (t.embedding <=> query_embedding) >= similarity_threshold
        AND (tensor_purpose IS NULL OR t.tensor_purpose = tensor_purpose)
    ORDER BY t.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Function to get tensor processing queue statistics
CREATE OR REPLACE FUNCTION get_tensor_queue_stats()
RETURNS TABLE (
    status varchar,
    count bigint,
    avg_processing_time real,
    avg_queue_wait_time real
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.status,
        COUNT(*),
        AVG(j.processing_time_ms),
        AVG(EXTRACT(EPOCH FROM (j.started_at - j.queued_at)) * 1000)
    FROM tensor_processing_jobs j
    WHERE j.created_at > NOW() - INTERVAL '24 hours'
    GROUP BY j.status
    ORDER BY 
        CASE j.status 
            WHEN 'running' THEN 1
            WHEN 'pending' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'failed' THEN 4
            ELSE 5
        END;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired tensors and cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_tensors()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Archive expired tensors
    UPDATE tensor_metadata 
    SET status = 'archived'
    WHERE expires_at < NOW() AND status = 'active';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete expired similarity search cache
    DELETE FROM similarity_search_cache WHERE expires_at < NOW();
    
    -- Clean up old job history (keep last 30 days)
    DELETE FROM tensor_processing_jobs 
    WHERE status IN ('completed', 'failed') 
        AND completed_at < NOW() - INTERVAL '30 days';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update tensor access statistics
CREATE OR REPLACE FUNCTION update_tensor_access_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tensor_metadata 
    SET 
        cache_hit_count = cache_hit_count + 1,
        last_accessed_at = NOW()
    WHERE id = NEW.tensor_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update tensor metadata on access
-- Note: This would be triggered by application-level access, not database access
-- CREATE TRIGGER trigger_update_tensor_access_stats
--     AFTER INSERT ON tensor_access_log  -- This table would need to be created separately
--     FOR EACH ROW EXECUTE FUNCTION update_tensor_access_stats();

-- Triggers for updated_at columns
CREATE TRIGGER update_tensor_metadata_updated_at 
    BEFORE UPDATE ON tensor_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tensor_processing_jobs_updated_at 
    BEFORE UPDATE ON tensor_processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_neural_models_updated_at 
    BEFORE UPDATE ON neural_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_neural_sprites_updated_at 
    BEFORE UPDATE ON neural_sprites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for active tensor processing with model information
CREATE OR REPLACE VIEW active_tensor_processing AS
SELECT 
    t.id,
    t.model_name,
    t.tensor_purpose,
    t.legal_context,
    t.size_bytes,
    t.cache_hit_count,
    t.last_accessed_at,
    d.document_title,
    c.case_number,
    c.case_title
FROM tensor_metadata t
LEFT JOIN legal_documents d ON t.legal_document_id = d.id
LEFT JOIN legal_cases c ON d.case_id = c.id
WHERE t.status = 'active';

-- View for neural model performance metrics
CREATE OR REPLACE VIEW neural_model_performance AS
SELECT 
    m.id,
    m.model_name,
    m.model_version,
    m.model_type,
    m.inference_time_ms,
    m.throughput_samples_sec,
    AVG(h.validation_accuracy) as avg_validation_accuracy,
    MAX(h.validation_accuracy) as best_validation_accuracy,
    COUNT(h.id) as training_checkpoints
FROM neural_models m
LEFT JOIN model_training_history h ON m.id = h.model_id
WHERE m.is_active = true
GROUP BY m.id, m.model_name, m.model_version, m.model_type, m.inference_time_ms, m.throughput_samples_sec;

-- Migration completed
SELECT 'Migration 003_tensor_processing.sql completed successfully' AS status;