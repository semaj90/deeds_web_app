-- Migration: create embeddings table for pgvector -- Adjust `vector` column type and index to match your pgvector
extension version CREATE TABLE IF NOT EXISTS embeddings ( id TEXT PRIMARY KEY, doc JSONB, vector vector ); -- Example
ivfflat index for pgvector (requires pgvector extension and tuned params) -- You may prefer ivfflat or ivfflat with
different lists and probes depending on your data CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings USING
ivfflat (vector);
