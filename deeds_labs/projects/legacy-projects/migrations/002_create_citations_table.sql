-- Migration: Create citations table for Google Search integration
-- Date: 2025-11-29
-- Description: Stores citations extracted from search results with metadata and embeddings

CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID,
    text TEXT NOT NULL,
    source_url VARCHAR NOT NULL,
    source_title VARCHAR,
    context_before TEXT,
    context_after TEXT,
    confidence FLOAT,
    highlighted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    verified_at TIMESTAMP,
    embedding vector(768)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_citations_result ON citations(result_id);
CREATE INDEX IF NOT EXISTS idx_citations_source ON citations(source_url);
CREATE INDEX IF NOT EXISTS idx_citations_created ON citations(created_at);
CREATE INDEX IF NOT EXISTS idx_citations_confidence ON citations(confidence);

-- Create GiST index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_citations_embedding ON citations USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE citations IS 'Stores citations extracted from search results with source tracking and embeddings';
COMMENT ON COLUMN citations.text IS 'The quoted passage from the source';
COMMENT ON COLUMN citations.source_url IS 'URL of the source document';
COMMENT ON COLUMN citations.confidence IS 'Confidence score of the citation accuracy (0-1)';
COMMENT ON COLUMN citations.embedding IS 'Vector embedding of the citation text for similarity search';
