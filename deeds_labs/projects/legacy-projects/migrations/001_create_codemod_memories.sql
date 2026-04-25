-- migrations/001_create_codemod_memories.sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create codemod_memories table with shared metadata schema
CREATE TABLE IF NOT EXISTS codemod_memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(768), -- 768 dimensions for embeddinggemma
    metadata JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_codemod_memories_embedding
ON codemod_memories USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_codemod_memories_metadata
ON codemod_memories USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_codemod_memories_source
ON codemod_memories ((metadata->>'source'));

CREATE INDEX IF NOT EXISTS idx_codemod_memories_error_code
ON codemod_memories ((metadata->>'error_code'));

CREATE INDEX IF NOT EXISTS idx_codemod_memories_language
ON codemod_memories ((metadata->>'language'));

CREATE INDEX IF NOT EXISTS idx_codemod_memories_tags
ON codemod_memories USING gin ((metadata->'tags'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_codemod_memories_updated_at
    BEFORE UPDATE ON codemod_memories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function for cosine similarity search
CREATE OR REPLACE FUNCTION search_codemod_memories(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.1,
    match_count int DEFAULT 10,
    source_filter text DEFAULT NULL,
    language_filter text DEFAULT NULL
)
RETURNS TABLE(
    id text,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cm.id,
        cm.content,
        cm.metadata,
        1 - (cm.embedding <=> query_embedding) as similarity
    FROM codemod_memories cm
    WHERE
        (source_filter IS NULL OR cm.metadata->>'source' = source_filter) AND
        (language_filter IS NULL OR cm.metadata->>'language' = language_filter) AND
        1 - (cm.embedding <=> query_embedding) > match_threshold
    ORDER BY cm.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;