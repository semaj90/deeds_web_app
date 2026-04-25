-- Redis-GPU Pipeline Database Schema Migration
-- Adds missing columns and tables required for Redis-GPU integration

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector embedding columns to evidence table
ALTER TABLE evidence 
ADD COLUMN IF NOT EXISTS title_embedding vector(384),
ADD COLUMN IF NOT EXISTS content_embedding vector(384),
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Add case_type column to cases table
ALTER TABLE cases 
ADD COLUMN IF NOT EXISTS case_type varchar(50) DEFAULT 'criminal';

-- Create document_metadata table for enhanced legal document tracking
CREATE TABLE IF NOT EXISTS document_metadata (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    evidence_id uuid REFERENCES evidence(id) ON DELETE CASCADE,
    case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
    document_type varchar(100),
    confidence_score decimal(5,4) DEFAULT 0.0000,
    processing_status varchar(50) DEFAULT 'pending',
    ai_analysis jsonb DEFAULT '{}',
    extracted_entities jsonb DEFAULT '[]',
    legal_citations jsonb DEFAULT '[]',
    similarity_scores jsonb DEFAULT '{}',
    embeddings_generated boolean DEFAULT false,
    simd_processed boolean DEFAULT false,
    gpu_processed boolean DEFAULT false,
    redis_cached boolean DEFAULT false,
    processing_time_ms integer DEFAULT 0,
    processed_at timestamp DEFAULT now(),
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
);

-- Create GPU cluster execution tracking tables
CREATE TABLE IF NOT EXISTS gpu_cluster_executions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    execution_date timestamp DEFAULT now(),
    total_workers integer NOT NULL,
    gpu_contexts integer NOT NULL,
    avg_duration_ms integer DEFAULT 0,
    success_rate decimal(5,2) DEFAULT 0.00,
    total_tasks integer DEFAULT 0,
    successful_tasks integer DEFAULT 0,
    failed_tasks integer DEFAULT 0,
    configuration jsonb DEFAULT '{}',
    metadata jsonb DEFAULT '{}',
    created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gpu_task_results (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    execution_id uuid REFERENCES gpu_cluster_executions(id) ON DELETE CASCADE,
    worker_id integer NOT NULL,
    task_name varchar(100) NOT NULL,
    task_type varchar(50) DEFAULT 'legal-ai',
    duration_ms integer DEFAULT 0,
    success boolean DEFAULT false,
    error_message text,
    metadata jsonb DEFAULT '{}',
    created_at timestamp DEFAULT now()
);

-- Create Redis job tracking table
CREATE TABLE IF NOT EXISTS redis_gpu_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id varchar(100) UNIQUE NOT NULL,
    job_type varchar(50) NOT NULL,
    status varchar(20) DEFAULT 'pending',
    priority integer DEFAULT 1,
    data jsonb DEFAULT '{}',
    result jsonb DEFAULT '{}',
    error_message text,
    created_at timestamp DEFAULT now(),
    started_at timestamp,
    completed_at timestamp,
    processing_time_ms integer DEFAULT 0
);

-- Add vector similarity indexes for performance
CREATE INDEX IF NOT EXISTS idx_evidence_title_embedding_cosine 
ON evidence USING ivfflat (title_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_evidence_content_embedding_cosine 
ON evidence USING ivfflat (content_embedding vector_cosine_ops);

-- Add indexes for GPU cluster performance tracking
CREATE INDEX IF NOT EXISTS idx_gpu_executions_date ON gpu_cluster_executions(execution_date);
CREATE INDEX IF NOT EXISTS idx_gpu_task_results_execution_id ON gpu_task_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_gpu_task_results_task_type ON gpu_task_results(task_type);

-- Add indexes for Redis job tracking
CREATE INDEX IF NOT EXISTS idx_redis_jobs_status ON redis_gpu_jobs(status);
CREATE INDEX IF NOT EXISTS idx_redis_jobs_created_at ON redis_gpu_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_redis_jobs_job_type ON redis_gpu_jobs(job_type);

-- Add legal-specific metadata indexes
CREATE INDEX IF NOT EXISTS idx_cases_case_type ON cases(case_type);
CREATE INDEX IF NOT EXISTS idx_document_metadata_evidence_id ON document_metadata(evidence_id);
CREATE INDEX IF NOT EXISTS idx_document_metadata_case_id ON document_metadata(case_id);
CREATE INDEX IF NOT EXISTS idx_document_metadata_document_type ON document_metadata(document_type);
CREATE INDEX IF NOT EXISTS idx_document_metadata_processing_status ON document_metadata(processing_status);

-- Update existing cases with default case_type if not already set
UPDATE cases SET case_type = 'criminal' WHERE case_type IS NULL;

-- Add helpful comments
COMMENT ON COLUMN evidence.title_embedding IS 'Vector embedding of evidence title for semantic search';
COMMENT ON COLUMN evidence.content_embedding IS 'Vector embedding of evidence content for similarity analysis';
COMMENT ON COLUMN cases.case_type IS 'Type of legal case: criminal, civil, administrative, etc.';
COMMENT ON TABLE document_metadata IS 'Enhanced metadata tracking for legal documents with AI processing status';
COMMENT ON TABLE gpu_cluster_executions IS 'Performance tracking for GPU cluster Redis-pipeline executions';
COMMENT ON TABLE gpu_task_results IS 'Individual task results from GPU cluster workers';
COMMENT ON TABLE redis_gpu_jobs IS 'Redis job queue tracking for GPU processing pipeline';

-- Success message
SELECT 'Redis-GPU Pipeline Schema Migration Completed Successfully!' as status;