-- Enhanced schema for evidence processing pipeline with embeddings and metadata

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Rename and enhance evidence_documents to evidence_files
ALTER TABLE IF EXISTS evidence_documents RENAME TO evidence_files;

-- Add new columns to evidence_files if they don't exist
ALTER TABLE evidence_files
ADD COLUMN IF NOT EXISTS minio_path VARCHAR(255),
ADD COLUMN IF NOT EXISTS uploaded_by UUID,
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS processing_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS processing_error TEXT,
ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create evidence_chunks table with enhanced schema
CREATE TABLE IF NOT EXISTS evidence_chunks_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence_files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    page_number INTEGER,
    section_title VARCHAR(255),
    legal_entities TEXT[],
    legal_references TEXT[],
    legal_concepts TEXT[],
    legal_tags TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for evidence_chunks_v2
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_v2_evidence_id ON evidence_chunks_v2(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_v2_page_number ON evidence_chunks_v2(page_number);
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_v2_created_at ON evidence_chunks_v2(created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_v2_legal_tags ON evidence_chunks_v2 USING GIN(legal_tags);

-- Create evidence_embeddings table for Qdrant integration
CREATE TABLE IF NOT EXISTS evidence_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL REFERENCES evidence_chunks_v2(id) ON DELETE CASCADE,
    embedding vector(768),
    embedding_model VARCHAR(100) DEFAULT 'embeddinggemma:latest',
    confidence FLOAT DEFAULT 1.0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_evidence_embeddings_vector ON evidence_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_evidence_embeddings_chunk_id ON evidence_embeddings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_evidence_embeddings_created_at ON evidence_embeddings(created_at);

-- Create evidence_processing_jobs table for tracking pipeline stages
CREATE TABLE IF NOT EXISTS evidence_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence_files(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    percentage INTEGER DEFAULT 0,
    eta_seconds INTEGER,
    error_message TEXT,
    error_recoverable BOOLEAN DEFAULT TRUE,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for evidence_processing_jobs
CREATE INDEX IF NOT EXISTS idx_evidence_processing_jobs_evidence_id ON evidence_processing_jobs(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_processing_jobs_stage ON evidence_processing_jobs(stage);
CREATE INDEX IF NOT EXISTS idx_evidence_processing_jobs_status ON evidence_processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_evidence_processing_jobs_created_at ON evidence_processing_jobs(created_at);

-- Create evidence_entities table for extracted legal entities
CREATE TABLE IF NOT EXISTS evidence_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL REFERENCES evidence_chunks_v2(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_value TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    position_in_text INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for evidence_entities
CREATE INDEX IF NOT EXISTS idx_evidence_entities_chunk_id ON evidence_entities(chunk_id);
CREATE INDEX IF NOT EXISTS idx_evidence_entities_entity_type ON evidence_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_evidence_entities_created_at ON evidence_entities(created_at);

-- Create evidence_references table for statute and case references
CREATE TABLE IF NOT EXISTS evidence_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL REFERENCES evidence_chunks_v2(id) ON DELETE CASCADE,
    reference_type VARCHAR(50) NOT NULL,
    reference_value TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    position_in_text INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for evidence_references
CREATE INDEX IF NOT EXISTS idx_evidence_references_chunk_id ON evidence_references(chunk_id);
CREATE INDEX IF NOT EXISTS idx_evidence_references_reference_type ON evidence_references(reference_type);
CREATE INDEX IF NOT EXISTS idx_evidence_references_created_at ON evidence_references(created_at);

-- Create BM25 full-text search index for keyword search
CREATE TABLE IF NOT EXISTS evidence_chunks_fts (
    chunk_id UUID PRIMARY KEY REFERENCES evidence_chunks_v2(id) ON DELETE CASCADE,
    content_tsvector tsvector
);

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_fts_content ON evidence_chunks_fts USING GIN(content_tsvector);

-- Create function to update full-text search index
CREATE OR REPLACE FUNCTION update_evidence_chunks_fts()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO evidence_chunks_fts (chunk_id, content_tsvector)
    VALUES (NEW.id, to_tsvector('english', NEW.content))
    ON CONFLICT (chunk_id) DO UPDATE SET
        content_tsvector = to_tsvector('english', NEW.content);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update full-text search index
DROP TRIGGER IF EXISTS trigger_update_evidence_chunks_fts ON evidence_chunks_v2;
CREATE TRIGGER trigger_update_evidence_chunks_fts
AFTER INSERT OR UPDATE ON evidence_chunks_v2
FOR EACH ROW
EXECUTE FUNCTION update_evidence_chunks_fts();

-- Create audit trail table
CREATE TABLE IF NOT EXISTS evidence_audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence_files(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor_id UUID,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for audit trail
CREATE INDEX IF NOT EXISTS idx_evidence_audit_trail_evidence_id ON evidence_audit_trail(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_audit_trail_action ON evidence_audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_evidence_audit_trail_created_at ON evidence_audit_trail(created_at);

-- Add comments for documentation
COMMENT ON TABLE evidence_files IS 'Stores metadata about uploaded evidence documents';
COMMENT ON TABLE evidence_chunks_v2 IS 'Stores semantic chunks extracted from evidence documents';
COMMENT ON TABLE evidence_embeddings IS 'Stores vector embeddings for semantic search';
COMMENT ON TABLE evidence_processing_jobs IS 'Tracks processing pipeline stages and status';
COMMENT ON TABLE evidence_entities IS 'Stores extracted legal entities from evidence chunks';
COMMENT ON TABLE evidence_references IS 'Stores statute and case references from evidence chunks';
COMMENT ON TABLE evidence_audit_trail IS 'Audit trail for evidence processing actions';

COMMENT ON COLUMN evidence_files.processing_status IS 'Status: pending, processing, completed, failed';
COMMENT ON COLUMN evidence_chunks_v2.legal_tags IS 'Array of legal metadata tags for filtering and ranking';
COMMENT ON COLUMN evidence_embeddings.embedding IS '768-dimensional vector for semantic search';
COMMENT ON COLUMN evidence_processing_jobs.stage IS 'Pipeline stage: classification, ocr, parsing, chunking, analysis, embedding, indexing';
