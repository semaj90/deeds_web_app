-- Non-destructive migration to add `embedding_768` vector(768) columns.
-- Uses conditional DO blocks to avoid errors when tables are absent.
-- Review before running on production. This file is a sidecar migration (manual apply).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_memory_observations') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_memory_observations' AND column_name = 'embedding_768') THEN
      ALTER TABLE public.agent_memory_observations ADD COLUMN embedding_768 vector(768);
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'parent_atlas_vectors') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parent_atlas_vectors' AND column_name = 'embedding_768') THEN
      ALTER TABLE public.parent_atlas_vectors ADD COLUMN embedding_768 vector(768);
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ace_chunks') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ace_chunks' AND column_name = 'embedding_768') THEN
      ALTER TABLE public.ace_chunks ADD COLUMN embedding_768 vector(768);
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_embeddings') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document_embeddings' AND column_name = 'embedding_768') THEN
      ALTER TABLE public.document_embeddings ADD COLUMN embedding_768 vector(768);
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'case_chunks') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_chunks' AND column_name = 'embedding_768') THEN
      ALTER TABLE public.case_chunks ADD COLUMN embedding_768 vector(768);
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vector_smoke') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vector_smoke' AND column_name = 'embedding_768') THEN
      ALTER TABLE public.vector_smoke ADD COLUMN embedding_768 vector(768);
    END IF;
  END IF;
END$$;

-- Add more blocks here for additional tables you want to prepare for 768-d backfill.
