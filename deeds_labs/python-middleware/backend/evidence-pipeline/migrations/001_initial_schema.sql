-- Initial schema for evidence processing pipeline

-- Evidence documents table
CREATE TABLE IF NOT EXISTS evidence_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    file_size_bytes INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evidence_documents_case_id ON evidence_documents(case_id);
CREATE INDEX idx_evidence_documents_status ON evidence_documents(status);
CREATE INDEX idx_evidence_documents_created_at ON evidence_documents(created_at);

-- Evidence chunks table
CREATE TABLE IF NOT EXISTS evidence_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES evidence_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding FLOAT8[] NULL,
    source_section VARCHAR(255) NULL,
    page_number INTEGER NULL,
    position_in_document INTEGER NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evidence_chunks_document_id ON evidence_chunks(document_id);
CREATE INDEX idx_evidence_chunks_created_at ON evidence_chunks(created_at);

-- Evidence processing jobs table
CREATE TABLE IF NOT EXISTS evidence_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES evidence_documents(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    error_message TEXT NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evidence_processing_jobs_document_id ON evidence_processing_jobs(document_id);
CREATE INDEX idx_evidence_processing_jobs_stage ON evidence_processing_jobs(stage);
CREATE INDEX idx_evidence_processing_jobs_status ON evidence_processing_jobs(status);
CREATE INDEX idx_evidence_processing_jobs_created_at ON evidence_processing_jobs(created_at);

-- Legal entities extracted from evidence
CREATE TABLE IF NOT EXISTS evidence_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL REFERENCES evidence_chunks(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_value TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    position_in_text INTEGER NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evidence_entities_chunk_id ON evidence_entities(chunk_id);
CREATE INDEX idx_evidence_entities_entity_type ON evidence_entities(entity_type);
CREATE INDEX idx_evidence_entities_created_at ON evidence_entities(created_at);
