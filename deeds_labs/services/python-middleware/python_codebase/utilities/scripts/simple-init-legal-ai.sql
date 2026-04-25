-- Simple idempotent init without DO blocks or FKs to missing tables
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Minimal document_metadata
CREATE TABLE IF NOT EXISTS public.document_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NULL,
  user_id UUID NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_size BIGINT,
  file_type VARCHAR(100),
  minio_bucket VARCHAR(100),
  minio_key VARCHAR(500),
  extracted_text TEXT,
  summary TEXT,
  upload_status VARCHAR(20) DEFAULT 'pending',
  processing_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ensure expected columns exist (no-op if present)
ALTER TABLE public.document_metadata
  ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
  ADD COLUMN IF NOT EXISTS upload_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Embeddings table with FK to metadata
CREATE TABLE IF NOT EXISTS public.document_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.document_metadata(id) ON DELETE CASCADE,
  chunk_number INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(384),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.document_embeddings
  ADD COLUMN IF NOT EXISTS embedding vector(384),
  ADD COLUMN IF NOT EXISTS chunk_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_document_metadata_case_id ON public.document_metadata(case_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id ON public.document_embeddings(document_id);
-- Vector index (non-concurrent here; safe in small datasets)
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector ON public.document_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Grants for legal_admin if role exists
GRANT USAGE ON SCHEMA public TO legal_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_metadata TO legal_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_embeddings TO legal_admin;
