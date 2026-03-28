-- Safe migration: create documents and document_chunks (UUID PKs) if missing -- and optionally copy data from evidences
-> documents, embeddings -> document_chunks DO $$ BEGIN -- Ensure pgvector extension CREATE EXTENSION IF NOT EXISTS
vector; -- Create documents table if missing IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE
table_schema='public' AND table_name='documents') THEN CREATE TABLE public.documents ( id uuid PRIMARY KEY, filename
character varying(255), created_at timestamp without time zone, metadata jsonb, storage_path text ); RAISE NOTICE
'Created table public.documents'; ELSE RAISE NOTICE 'Table public.documents already exists; skipping'; END IF; -- Create
document_chunks table if missing IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND
table_name='document_chunks') THEN CREATE TABLE public.document_chunks ( id uuid PRIMARY KEY, document_id uuid
REFERENCES public.documents(id) ON DELETE CASCADE, chunk_index integer, text_snippet text, embedding vector(1536) );
RAISE NOTICE 'Created table public.document_chunks'; ELSE RAISE NOTICE 'Table public.document_chunks exists; skipping';
END IF; -- If evidences table exists and documents is empty, copy over basic rows IF EXISTS (SELECT 1 FROM
information_schema.tables WHERE table_schema='public' AND table_name='evidences') THEN IF (SELECT count(*) FROM
public.documents) = 0 THEN INSERT INTO public.documents (id, filename, created_at, metadata, storage_path) SELECT id,
file_name, created_at, metadata, storage_path FROM public.evidences; RAISE NOTICE 'Copied rows from evidences ->
documents'; ELSE RAISE NOTICE 'documents not empty; skipping copy from evidences'; END IF; END IF; -- If embeddings
table exists and document_chunks is empty, copy over embeddings IF EXISTS (SELECT 1 FROM information_schema.tables WHERE
table_schema='public' AND table_name='embeddings') THEN IF (SELECT count(*) FROM public.document_chunks) = 0 THEN --
Attempt to map embeddings.evidence_id -> documents.id where possible INSERT INTO public.document_chunks (id,
document_id, chunk_index, text_snippet, embedding) SELECT e.id, e.evidence_id, e.chunk_index, e.text_snippet, e.vector
FROM public.embeddings e WHERE EXISTS (SELECT 1 FROM public.documents d WHERE d.id = e.evidence_id); RAISE NOTICE
'Copied rows from embeddings -> document_chunks (where parent document exists)'; ELSE RAISE NOTICE 'document_chunks not
empty; skipping copy from embeddings'; END IF; END IF; END$$;
