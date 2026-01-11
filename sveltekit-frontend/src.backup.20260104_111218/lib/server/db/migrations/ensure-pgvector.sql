-- Ensure pgvector extension is installed CREATE EXTENSION IF NOT EXISTS vector; -- Verify document_embeddings table has
proper vector column -- This will fail silently if table doesn't exist yet (OK during migration) DO $$ BEGIN IF EXISTS (
SELECT 1 FROM information_schema.tables WHERE table_name = 'document_embeddings' ) THEN -- Table exists, ensure vector
column is properly typed ALTER TABLE document_embeddings ALTER COLUMN embedding SET DATA TYPE vector(384) USING
embedding::vector(384); END IF; END $$; -- Create HNSW index for vector similarity search if table exists DO $$ BEGIN IF
EXISTS ( SELECT 1 FROM information_schema.tables WHERE table_name = 'document_embeddings' ) THEN CREATE INDEX IF NOT
EXISTS idx_document_embeddings_hnsw ON document_embeddings USING hnsw (embedding vector_cosine_ops); END IF; END $$;
