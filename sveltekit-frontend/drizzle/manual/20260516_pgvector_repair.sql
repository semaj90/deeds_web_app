-- pgvector Repair Script — Phase 6E
-- Aligns live DB columns with Drizzle schema

-- 1. evidence_vectors (EMPTY)
-- Drizzle wants: embedding vector(384)
-- Actual: vector text
DROP TABLE IF EXISTS evidence_vectors;
CREATE TABLE evidence_vectors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id uuid NOT NULL,
    embedding vector(384),
    embedding_type varchar(50) NOT NULL,
    source_field varchar(100) NOT NULL,
    model varchar(100) DEFAULT 'nomic-embed-text' NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);

-- 2. legal_documents (3 rows - safe to alter)
-- Drizzle wants: content_embedding vector(768)
-- Actual: content_embedding text
ALTER TABLE legal_documents 
  ALTER COLUMN content_embedding TYPE vector(768) 
  USING (CASE WHEN content_embedding IS NULL OR content_embedding = '' THEN NULL ELSE content_embedding::vector(768) END);

-- 3. document_embeddings (EMPTY)
-- Drizzle wants: embedding vector(384)
-- Actual: embedding jsonb
ALTER TABLE document_embeddings 
  ALTER COLUMN embedding TYPE vector(384) 
  USING (CASE WHEN embedding IS NULL THEN NULL ELSE embedding::text::vector(384) END);

-- 4. codebase_chunk_index (Optional)
-- Ensure HNSW naming consistency if needed, but it already has them.
