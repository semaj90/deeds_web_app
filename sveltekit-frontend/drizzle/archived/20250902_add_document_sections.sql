-- Add document_sections table for document chunking
-- This supports vector search and RAG functionality

CREATE TABLE IF NOT EXISTS document_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    section_number INTEGER NOT NULL,
    title VARCHAR(500),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding vector(384), -- nomic-embed-text dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_document_sections_document_id 
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_sections_document_id 
ON document_sections(document_id);

CREATE INDEX IF NOT EXISTS idx_document_sections_embedding 
ON document_sections USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_document_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_document_sections_updated_at ON document_sections;
CREATE TRIGGER trigger_document_sections_updated_at
    BEFORE UPDATE ON document_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_document_sections_updated_at();