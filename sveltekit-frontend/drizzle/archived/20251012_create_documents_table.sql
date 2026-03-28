-- Drizzle SQL migration: create documents table with UUID PK and pgvector column -- Idempotent: checks for table
existence before creation DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public'
AND table_name='documents') THEN CREATE TABLE public.documents ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), filename
character varying(255) NOT NULL, created_at timestamp without time zone DEFAULT now(), content_embedding vector(1536) );
-- Ensure pgvector extension exists (safe to run repeatedly) CREATE EXTENSION IF NOT EXISTS vector; RAISE NOTICE
'Created table documents (uuid PK) and ensured pgvector extension'; ELSE RAISE NOTICE 'Table documents already exists;
skipping creation'; END IF; END$$;
