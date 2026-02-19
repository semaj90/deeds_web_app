-- Safe initialization for Legal AI tables and extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- document_metadata table (minimal set used by services)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='document_metadata'
  ) THEN
    EXECUTE $$
      CREATE TABLE public.document_metadata (
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
      )
    $$;
  END IF;
END$$;

-- Ensure required columns exist on document_metadata
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='document_metadata' AND column_name='original_filename'
  ) THEN
    ALTER TABLE public.document_metadata ADD COLUMN original_filename VARCHAR(255);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='document_metadata' AND column_name='upload_status'
  ) THEN
    ALTER TABLE public.document_metadata ADD COLUMN upload_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='document_metadata' AND column_name='processing_status'
  ) THEN
    ALTER TABLE public.document_metadata ADD COLUMN processing_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='document_metadata' AND column_name='updated_at'
  ) THEN
    ALTER TABLE public.document_metadata ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END$$;

-- document_embeddings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='document_embeddings'
  ) THEN
    EXECUTE $$
      CREATE TABLE public.document_embeddings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        document_id UUID NOT NULL REFERENCES public.document_metadata(id) ON DELETE CASCADE,
        chunk_number INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(384), -- nomic-embed-text dims by default
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    $$;
  END IF;
END$$;

-- Ensure required columns exist on document_embeddings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='document_embeddings' AND column_name='embedding'
  ) THEN
    ALTER TABLE public.document_embeddings ADD COLUMN embedding vector(384);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='document_embeddings' AND column_name='chunk_number'
  ) THEN
    ALTER TABLE public.document_embeddings ADD COLUMN chunk_number INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='document_embeddings' AND column_name='updated_at'
  ) THEN
    ALTER TABLE public.document_embeddings ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END$$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_document_metadata_case_id ON public.document_metadata(case_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id ON public.document_embeddings(document_id);
-- Vector index (use IVFFLAT starter; lists tuned later)
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector ON public.document_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Grants so legal_admin can use the tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='legal_admin') THEN
    GRANT USAGE ON SCHEMA public TO legal_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_metadata TO legal_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_embeddings TO legal_admin;
  END IF;
END$$;
