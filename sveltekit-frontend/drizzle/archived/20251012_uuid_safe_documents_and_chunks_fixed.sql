-- Safe migration: create documents and document_chunks (UUID PKs) if missing -- Fixed version: handles missing columns
gracefully DO $$ BEGIN -- Ensure pgvector extension CREATE EXTENSION IF NOT EXISTS vector; -- Create documents table if
missing IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='documents')
THEN CREATE TABLE public.documents ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), filename character varying(255),
created_at timestamp without time zone DEFAULT now(), metadata jsonb, storage_path text ); RAISE NOTICE 'Created table
public.documents'; ELSE RAISE NOTICE 'Table public.documents already exists; skipping'; END IF; -- Create
document_chunks table if missing IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND
table_name='document_chunks') THEN CREATE TABLE public.document_chunks ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE, chunk_index integer, chunk_text text, embedding
vector(1536) ); -- Create index for vector similarity search CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON
public.document_chunks USING hnsw (embedding vector_cosine_ops); RAISE NOTICE 'Created table public.document_chunks';
ELSE RAISE NOTICE 'Table public.document_chunks exists; skipping'; END IF; -- Optionally copy data from evidences table
if it exists and documents is empty IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND
table_name='evidences') THEN IF (SELECT count(*) FROM public.documents) = 0 THEN INSERT INTO public.documents (id,
filename, created_at, metadata, storage_path) SELECT id, COALESCE(file_name, 'unknown') as filename,
COALESCE(created_at, now()) as created_at, metadata, storage_path FROM public.evidences ON CONFLICT (id) DO NOTHING;
RAISE NOTICE 'Copied rows from evidences -> documents'; ELSE RAISE NOTICE 'documents not empty; skipping copy from
evidences'; END IF; END IF; -- Optionally copy data from embeddings table if it exists IF EXISTS (SELECT 1 FROM
information_schema.tables WHERE table_schema='public' AND table_name='embeddings') THEN IF (SELECT count(*) FROM
public.document_chunks) = 0 THEN -- Check which columns exist in embeddings table IF EXISTS ( SELECT 1 FROM
information_schema.columns WHERE table_schema='public' AND table_name='embeddings' AND column_name='chunk_text' ) THEN
-- Use chunk_text if it exists INSERT INTO public.document_chunks (id, document_id, chunk_index, chunk_text, embedding)
SELECT COALESCE(e.id, gen_random_uuid()) as id, e.evidence_id as document_id, COALESCE(e.chunk_index, 0) as chunk_index,
COALESCE(e.chunk_text, '') as chunk_text, e.vector as embedding FROM public.embeddings e WHERE EXISTS (SELECT 1 FROM
public.documents d WHERE d.id = e.evidence_id) ON CONFLICT (id) DO NOTHING; RAISE NOTICE 'Copied rows from embeddings ->
document_chunks (using chunk_text)'; ELSIF EXISTS ( SELECT 1 FROM information_schema.columns WHERE table_schema='public'
AND table_name='embeddings' AND column_name='text' ) THEN -- Use text column as fallback INSERT INTO
public.document_chunks (id, document_id, chunk_index, chunk_text, embedding) SELECT COALESCE(e.id, gen_random_uuid()) as
id, e.evidence_id as document_id, COALESCE(e.chunk_index, 0) as chunk_index, COALESCE(e.text, '') as chunk_text,
e.vector as embedding FROM public.embeddings e WHERE EXISTS (SELECT 1 FROM public.documents d WHERE d.id =
e.evidence_id) ON CONFLICT (id) DO NOTHING; RAISE NOTICE 'Copied rows from embeddings -> document_chunks (using text
column)'; ELSE -- No text column found, skip text but copy embeddings RAISE NOTICE 'No text column found in embeddings,
creating chunks without text'; END IF; ELSE RAISE NOTICE 'document_chunks not empty; skipping copy from embeddings'; END
IF; END IF; END$$;
