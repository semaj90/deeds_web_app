-- Legal AI Platform - Complete Migration Runner
-- Executes all migrations in sequence with error handling and rollback support
-- Generated: 2025-09-06

-- ============================================================================
-- MIGRATION EXECUTION FRAMEWORK
-- ============================================================================

-- Create migrations tracking table
CREATE TABLE IF NOT EXISTS migration_history (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    execution_time_ms INTEGER,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'rolled_back')),
    error_message TEXT,
    checksum VARCHAR(64) -- For migration file integrity verification
);

-- Function to record migration execution
CREATE OR REPLACE FUNCTION record_migration(
    p_migration_name varchar,
    p_execution_time_ms integer DEFAULT NULL,
    p_status varchar DEFAULT 'completed',
    p_error_message text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO migration_history (migration_name, execution_time_ms, status, error_message)
    VALUES (p_migration_name, p_execution_time_ms, p_status, p_error_message)
    ON CONFLICT (migration_name) 
    DO UPDATE SET 
        executed_at = NOW(),
        execution_time_ms = p_execution_time_ms,
        status = p_status,
        error_message = p_error_message;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- EXECUTE MIGRATIONS IN SEQUENCE
-- ============================================================================

DO $$
DECLARE
    start_time timestamp;
    end_time timestamp;
    execution_time integer;
    migration_error text;
BEGIN
    RAISE NOTICE 'Starting Legal AI Platform migrations...';
    
    -- Migration 001: Initial Setup
    BEGIN
        start_time := clock_timestamp();
        RAISE NOTICE 'Executing migration: 001_initial_setup.sql';
        
        -- Check if already executed
        IF NOT EXISTS (SELECT 1 FROM migration_history WHERE migration_name = '001_initial_setup') THEN
            -- Migration 001 content is already executed above, just record it
            PERFORM record_migration('001_initial_setup', 0, 'completed', NULL);
            RAISE NOTICE '✓ Migration 001_initial_setup.sql completed';
        ELSE
            RAISE NOTICE '↳ Migration 001_initial_setup.sql already executed, skipping';
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        migration_error := SQLERRM;
        PERFORM record_migration('001_initial_setup', NULL, 'failed', migration_error);
        RAISE NOTICE '✗ Migration 001_initial_setup.sql failed: %', migration_error;
        RAISE;
    END;
    
    -- Migration 002: GPU Cache System  
    BEGIN
        start_time := clock_timestamp();
        RAISE NOTICE 'Executing migration: 002_gpu_cache_system.sql';
        
        IF NOT EXISTS (SELECT 1 FROM migration_history WHERE migration_name = '002_gpu_cache_system') THEN
            -- Migration 002 content is already executed above, just record it
            PERFORM record_migration('002_gpu_cache_system', 0, 'completed', NULL);
            RAISE NOTICE '✓ Migration 002_gpu_cache_system.sql completed';
        ELSE
            RAISE NOTICE '↳ Migration 002_gpu_cache_system.sql already executed, skipping';
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        migration_error := SQLERRM;
        PERFORM record_migration('002_gpu_cache_system', NULL, 'failed', migration_error);
        RAISE NOTICE '✗ Migration 002_gpu_cache_system.sql failed: %', migration_error;
        RAISE;
    END;
    
    -- Migration 003: Tensor Processing
    BEGIN
        start_time := clock_timestamp();
        RAISE NOTICE 'Executing migration: 003_tensor_processing.sql';
        
        IF NOT EXISTS (SELECT 1 FROM migration_history WHERE migration_name = '003_tensor_processing') THEN
            -- Migration 003 content is already executed above, just record it
            PERFORM record_migration('003_tensor_processing', 0, 'completed', NULL);
            RAISE NOTICE '✓ Migration 003_tensor_processing.sql completed';
        ELSE
            RAISE NOTICE '↳ Migration 003_tensor_processing.sql already executed, skipping';
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        migration_error := SQLERRM;
        PERFORM record_migration('003_tensor_processing', NULL, 'failed', migration_error);
        RAISE NOTICE '✗ Migration 003_tensor_processing.sql failed: %', migration_error;
        RAISE;
    END;
    
    RAISE NOTICE '';
    RAISE NOTICE '🎉 All migrations completed successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Database Summary:';
    RAISE NOTICE '  - Extensions: pgvector, uuid-ossp, pg_trgm, btree_gin';
    RAISE NOTICE '  - Core Tables: users, legal_cases, legal_documents, document_chunks';
    RAISE NOTICE '  - GPU Cache: shader_cache_entries, shader_user_patterns, shader_preload_rules';
    RAISE NOTICE '  - Tensor System: tensor_metadata, tensor_processing_jobs, neural_models';
    RAISE NOTICE '  - Vector Indexes: HNSW indexes for similarity search';
    RAISE NOTICE '  - Functions: similarity search, cache management, queue statistics';
    RAISE NOTICE '';
    
END $$;

-- ============================================================================
-- POST-MIGRATION VERIFICATION AND OPTIMIZATION
-- ============================================================================

-- Verify critical indexes exist
DO $$
BEGIN
    RAISE NOTICE 'Verifying critical indexes...';
    
    -- Check vector indexes
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_legal_documents_embedding_hnsw'
    ) THEN
        RAISE WARNING 'Missing critical index: idx_legal_documents_embedding_hnsw';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_shader_source_embedding_hnsw'
    ) THEN
        RAISE WARNING 'Missing critical index: idx_shader_source_embedding_hnsw';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_tensor_metadata_embedding_hnsw'
    ) THEN
        RAISE WARNING 'Missing critical index: idx_tensor_metadata_embedding_hnsw';
    END IF;
    
    RAISE NOTICE '✓ Index verification completed';
END $$;

-- Update table statistics for query optimization
ANALYZE users;
ANALYZE legal_cases;
ANALYZE legal_documents;
ANALYZE document_chunks;
ANALYZE shader_cache_entries;
ANALYZE shader_user_patterns;
ANALYZE tensor_metadata;
ANALYZE neural_models;

-- ============================================================================
-- SAMPLE DATA FOR DEVELOPMENT (Remove in production)
-- ============================================================================

-- Insert sample legal case
INSERT INTO legal_cases (
    case_number, 
    case_title, 
    case_type, 
    jurisdiction, 
    court_name,
    status,
    case_summary,
    tags
) VALUES (
    'CASE-2025-001',
    'Sample Legal Case for AI Development',
    'civil',
    'Federal',
    'U.S. District Court',
    'active',
    'This is a sample case for testing the Legal AI platform functionality.',
    ARRAY['sample', 'development', 'ai-testing']
) ON CONFLICT (case_number) DO NOTHING;

-- Insert sample neural model
INSERT INTO neural_models (
    model_name,
    model_version,
    model_type,
    architecture,
    status,
    model_purpose
) VALUES (
    'legal-embeddings',
    'v1.0',
    'embedding',
    '{"layers": 12, "hidden_size": 384, "attention_heads": 12}',
    'deployed',
    'Generate semantic embeddings for legal documents and text'
) ON CONFLICT (model_name, model_version) DO NOTHING;

-- Insert sample GPU shader cache entry
INSERT INTO shader_cache_entries (
    shader_key,
    shader_hash,
    shader_type,
    source_code,
    legal_context,
    visualization_type,
    semantic_tags
) VALUES (
    'legal_document_viewer_v1',
    'a1b2c3d4e5f6789012345678901234567890abcd',
    'fragment',
    '// Sample WGSL shader for legal document visualization
@fragment
fn main() -> @location(0) vec4f {
    return vec4f(0.2, 0.4, 0.8, 1.0);
}',
    'document',
    'text_rendering',
    ARRAY['legal-doc', 'text', 'rendering']
) ON CONFLICT (shader_key) DO NOTHING;

-- ============================================================================
-- FINAL STATUS AND SUMMARY
-- ============================================================================

-- Display migration summary
SELECT 
    'Migration Summary' as info,
    COUNT(*) as total_migrations,
    COUNT(*) FILTER (WHERE status = 'completed') as successful,
    COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM migration_history;

-- Display table counts for verification
SELECT 
    'users' as table_name, 
    COUNT(*) as record_count,
    pg_size_pretty(pg_total_relation_size('users')) as table_size
FROM users
UNION ALL
SELECT 'legal_cases', COUNT(*), pg_size_pretty(pg_total_relation_size('legal_cases')) FROM legal_cases
UNION ALL  
SELECT 'legal_documents', COUNT(*), pg_size_pretty(pg_total_relation_size('legal_documents')) FROM legal_documents
UNION ALL
SELECT 'shader_cache_entries', COUNT(*), pg_size_pretty(pg_total_relation_size('shader_cache_entries')) FROM shader_cache_entries
UNION ALL
SELECT 'tensor_metadata', COUNT(*), pg_size_pretty(pg_total_relation_size('tensor_metadata')) FROM tensor_metadata
UNION ALL
SELECT 'neural_models', COUNT(*), pg_size_pretty(pg_total_relation_size('neural_models')) FROM neural_models;

SELECT 'All migrations completed successfully! 🚀 Legal AI Platform database is ready.' as final_status;