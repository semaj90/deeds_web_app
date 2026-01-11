-- Migration: 011_create_case_memories_and_pgvector.sql -- Creates `case_memories` table and ensures pgvector extension
is present. -- This migration follows the project's existing pgvector initialization patterns. BEGIN; -- Ensure vector
extension exists CREATE EXTENSION IF NOT EXISTS "vector"; -- Create case_memories table to store long-term AI memories
for cases CREATE TABLE IF NOT EXISTS case_memories ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT
NULL, memory_type varchar(128) NOT NULL, content text, metadata jsonb, embedding vector(1536), -- match
Gemma3/embeddinggemma vector size used elsewhere created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT
now() ); -- Add index for fast lookups by case CREATE INDEX IF NOT EXISTS idx_case_memories_case_id ON
case_memories(case_id); -- Create ivfflat index for embedding column (cosine ops) -- Adjust lists parameter to expected
dataset size; 100 is a conservative default DO $$ BEGIN IF NOT EXISTS ( SELECT 1 FROM pg_class c JOIN pg_namespace n ON
n.oid = c.relnamespace WHERE c.relname = 'idx_case_memories_embedding' ) THEN EXECUTE 'CREATE INDEX
idx_case_memories_embedding ON case_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)'; END IF;
END$$; COMMIT; -- Notes: If your embeddings are 768-dim or another size, change the vector(1536) above accordingly.
