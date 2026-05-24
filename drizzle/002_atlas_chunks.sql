-- Migration 002: Create atlas_chunks table
CREATE TABLE atlas_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES atlas_files(id) ON DELETE CASCADE,
    symbol TEXT,
    text TEXT NOT NULL,
    start_line INTEGER,
    end_line INTEGER,
    embedding_id TEXT,
    UNIQUE (file_id, start_line, end_line) -- Assuming chunk uniqueness based on file and line range
);
-- Indexing for faster retrieval by file and line number
CREATE INDEX idx_atlas_chunks_file_id ON atlas_chunks(file_id);
CREATE INDEX idx_atlas_chunks_line ON atlas_chunks(start_line, end_line);