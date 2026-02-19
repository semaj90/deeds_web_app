-- Minimal idempotent init for legal_documents with pgvector (384 dims)
-- Avoids altering existing related tables to prevent conflicts

-- Assumes extension "vector" already installed. If not, install it manually with a superuser.

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id UUID PRIMARY KEY,
  title TEXT,
  content TEXT,
  document_type TEXT,
  case_id TEXT,
  file_path TEXT,
  file_hash TEXT UNIQUE,
  metadata JSONB,
  embedding vector(384),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  indexed_at TIMESTAMP
);

-- Add columns if missing (safe on existing tables created by other tools)
ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS case_id TEXT,
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS embedding vector(384),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMP;

-- Basic indexes
CREATE INDEX IF NOT EXISTS legal_documents_embedding_idx
  ON public.legal_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS legal_documents_content_idx
  ON public.legal_documents USING GIN (to_tsvector('english', content));
