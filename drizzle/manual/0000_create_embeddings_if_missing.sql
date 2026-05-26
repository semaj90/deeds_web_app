-- Safe create for embeddings table used by case_chunks migration
CREATE TABLE IF NOT EXISTS embeddings (
    id serial PRIMARY KEY,
    task_id varchar(100),
    payload text,
    metadata jsonb,
    embedding vector(384),
    text_hash varchar(64),
    content text,
    model varchar(100) DEFAULT 'nomic-embed-text:latest',
    document_type varchar(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    embedding_384 vector(384),
    CONSTRAINT embeddings_text_hash_unique UNIQUE(text_hash)
);

-- Add an ivfflat index if pgvector is available (non-fatal if fails)
DO $$
BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_ivfflat ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists=100)';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create ivfflat index (pgvector may be missing): %', SQLERRM;
END$$;
