-- Migration for missing table: case_chunks
CREATE TABLE case_chunks (
    id SERIAL PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    chunk_source TEXT NOT NULL,
    chunk_embedding_id INTEGER REFERENCES embeddings(id) ON DELETE CASCADE,
    chunk_embedding VECTOR(384),
    chunk_metadata JSONB,
    UNIQUE (case_id, chunk_source)
);