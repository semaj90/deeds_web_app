-- Indexing / ACE / library schema merge for the live app database on :5432
-- Purpose:
--   - Bring the lean pgvector cluster up to the schema the app routes expect
--   - Add the legal library, glossary, citation tag, embedding cache, and Yorha graph tables
--   - Keep the migration additive and idempotent

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type') THEN
    CREATE TYPE public.source_type AS ENUM (
      'upload',
      'govinfo',
      'state_official',
      'openstates',
      'lii_reference'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'corpus_type') THEN
    CREATE TYPE public.corpus_type AS ENUM (
      'constitution',
      'statute',
      'regulation',
      'bill',
      'case',
      'glossary',
      'treatise',
      'other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'legal_node_type') THEN
    CREATE TYPE public.legal_node_type AS ENUM (
      'document',
      'title',
      'article',
      'chapter',
      'part',
      'section',
      'subsection',
      'paragraph',
      'clause',
      'definition',
      'appendix',
      'note'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_status') THEN
    CREATE TYPE public.processing_status AS ENUM (
      'queued',
      'extracting',
      'ocr',
      'structuring',
      'chunking',
      'embedding',
      'graphing',
      'complete',
      'failed'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_link_category') THEN
    CREATE TYPE public.case_link_category AS ENUM (
      'charged_under',
      'cited_authority',
      'defense_authority',
      'court_ruling',
      'related_regulation',
      'constitutional_basis',
      'sentencing_guideline',
      'glossary_concept'
    );
  ELSE
    ALTER TYPE public.case_link_category ADD VALUE IF NOT EXISTS 'glossary_concept';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relation_type') THEN
    CREATE TYPE public.relation_type AS ENUM (
      'supports',
      'contradicts',
      'same_person',
      'timeline',
      'chain_of_custody',
      'corroborates',
      'alibi',
      'motive',
      'opportunity',
      'means',
      'witness_statement',
      'physical_evidence',
      'digital_evidence',
      'circumstantial',
      'direct_evidence',
      'hearsay',
      'privileged',
      'inadmissible'
    );
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.jurisdictions_id_seq;

CREATE TABLE IF NOT EXISTS public.jurisdictions (
  id bigint PRIMARY KEY DEFAULT nextval('public.jurisdictions_id_seq'::regclass),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  level text NOT NULL,
  parent_id bigint
);

CREATE TABLE IF NOT EXISTS public.library_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type public.source_type NOT NULL DEFAULT 'upload',
  corpus_type public.corpus_type NOT NULL DEFAULT 'other',
  jurisdiction_id bigint,
  title text NOT NULL,
  short_title text,
  citation text,
  official_url text,
  source_hash text,
  mime_type text DEFAULT 'application/pdf',
  minio_key text NOT NULL,
  page_count integer,
  effective_date date,
  updated_at_source timestamptz,
  is_official boolean DEFAULT false,
  processing_status public.processing_status NOT NULL DEFAULT 'queued',
  uploaded_by integer,
  source_confidence text DEFAULT 'medium',
  fetched_at timestamptz,
  minio_key_normalized text,
  source_kind text DEFAULT 'uploaded_pdf',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_documents_jurisdiction_id_fkey
    FOREIGN KEY (jurisdiction_id) REFERENCES public.jurisdictions(id),
  CONSTRAINT library_documents_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.library_documents ADD COLUMN IF NOT EXISTS source_confidence text DEFAULT 'medium';
ALTER TABLE public.library_documents ADD COLUMN IF NOT EXISTS fetched_at timestamptz;
ALTER TABLE public.library_documents ADD COLUMN IF NOT EXISTS minio_key_normalized text;
ALTER TABLE public.library_documents ADD COLUMN IF NOT EXISTS source_kind text DEFAULT 'uploaded_pdf';

CREATE TABLE IF NOT EXISTS public.library_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  version_label text,
  source_date date,
  is_current boolean DEFAULT false,
  parent_version_id uuid,
  diff_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_document_versions_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.library_documents(id) ON DELETE CASCADE,
  CONSTRAINT library_document_versions_parent_version_id_fkey
    FOREIGN KEY (parent_version_id) REFERENCES public.library_document_versions(id)
);

CREATE TABLE IF NOT EXISTS public.legal_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  version_id uuid,
  parent_node_id uuid,
  node_type public.legal_node_type NOT NULL DEFAULT 'section',
  ordinal text,
  heading text,
  citation_label text,
  node_path text NOT NULL,
  depth integer NOT NULL DEFAULT 0,
  page_start integer,
  page_end integer,
  char_start integer,
  char_end integer,
  full_text text NOT NULL,
  text_clean text NOT NULL,
  tsv tsvector,
  tags_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_nodes_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.library_documents(id) ON DELETE CASCADE,
  CONSTRAINT legal_nodes_parent_node_id_fkey
    FOREIGN KEY (parent_node_id) REFERENCES public.legal_nodes(id) ON DELETE CASCADE,
  CONSTRAINT legal_nodes_version_id_fkey
    FOREIGN KEY (version_id) REFERENCES public.library_document_versions(id) ON DELETE CASCADE
);

ALTER TABLE public.legal_nodes ADD COLUMN IF NOT EXISTS tsv tsvector;
ALTER TABLE public.legal_nodes ADD COLUMN IF NOT EXISTS tags_json jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.legal_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_node_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  chunk_text text NOT NULL,
  token_count integer,
  page_start integer,
  page_end integer,
  char_start integer,
  char_end integer,
  embedding vector(768),
  tsv tsvector,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  qdrant_point_id text,
  CONSTRAINT legal_chunks_legal_node_id_chunk_index_key UNIQUE (legal_node_id, chunk_index),
  CONSTRAINT legal_chunks_legal_node_id_fkey
    FOREIGN KEY (legal_node_id) REFERENCES public.legal_nodes(id) ON DELETE CASCADE
);

ALTER TABLE public.legal_chunks ADD COLUMN IF NOT EXISTS tsv tsvector;
ALTER TABLE public.legal_chunks ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.legal_chunks ADD COLUMN IF NOT EXISTS qdrant_point_id text;

CREATE TABLE IF NOT EXISTS public.legal_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  normalized_term text NOT NULL,
  defined_in_node_id uuid NOT NULL,
  definition_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_definitions_defined_in_node_id_fkey
    FOREIGN KEY (defined_in_node_id) REFERENCES public.legal_nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.legal_glossary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term varchar(255) NOT NULL,
  definition text NOT NULL,
  category varchar(100),
  jurisdiction varchar(100),
  related_terms jsonb,
  sources jsonb,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_glossary_term_unique UNIQUE (term)
);

CREATE TABLE IF NOT EXISTS public.case_library_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  document_id uuid,
  node_id uuid,
  category public.case_link_category NOT NULL DEFAULT 'cited_authority',
  relevance_score real,
  citation_text text,
  notes text,
  added_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_library_links_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE,
  CONSTRAINT case_library_links_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.library_documents(id) ON DELETE CASCADE,
  CONSTRAINT case_library_links_node_id_fkey
    FOREIGN KEY (node_id) REFERENCES public.legal_nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  stage public.processing_status NOT NULL DEFAULT 'queued',
  status text NOT NULL DEFAULT 'running',
  progress numeric(5, 2) DEFAULT 0,
  error_text text,
  metrics_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingestion_jobs_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.library_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.evidence_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  from_evidence_id uuid NOT NULL,
  to_evidence_id uuid NOT NULL,
  relationship_type public.relation_type NOT NULL,
  label text,
  strength varchar(20) NOT NULL DEFAULT 'medium',
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT evidence_relationships_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE,
  CONSTRAINT evidence_relationships_from_evidence_id_fkey
    FOREIGN KEY (from_evidence_id) REFERENCES public.evidence(id) ON DELETE CASCADE,
  CONSTRAINT evidence_relationships_to_evidence_id_fkey
    FOREIGN KEY (to_evidence_id) REFERENCES public.evidence(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.citation_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL,
  name varchar(255) NOT NULL,
  description text,
  color varchar(7) DEFAULT '#8B2332',
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT citation_collections_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.collection_citations (
  collection_id uuid NOT NULL,
  citation_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_citations_pkey PRIMARY KEY (collection_id, citation_id),
  CONSTRAINT collection_citations_collection_id_fkey
    FOREIGN KEY (collection_id) REFERENCES public.citation_collections(id) ON DELETE CASCADE,
  CONSTRAINT collection_citations_citation_id_fkey
    FOREIGN KEY (citation_id) REFERENCES public.citations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.citation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_id uuid NOT NULL,
  tag varchar(100) NOT NULL,
  color varchar(7) DEFAULT '#6b7280',
  created_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT citation_tags_citation_id_fkey
    FOREIGN KEY (citation_id) REFERENCES public.citations(id) ON DELETE CASCADE,
  CONSTRAINT citation_tags_unique UNIQUE (citation_id, tag)
);

CREATE TABLE IF NOT EXISTS public.document_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  topic_id integer NOT NULL,
  membership_probability real NOT NULL,
  centroid_distance real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_topics_document_id_topic_id_unique UNIQUE (document_id, topic_id)
);

CREATE TABLE IF NOT EXISTS public.embedding_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text_hash text NOT NULL UNIQUE,
  model varchar(100) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  embedding vector(768) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.yorha_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number varchar(100) NOT NULL UNIQUE,
  title varchar(500) NOT NULL,
  description text,
  status varchar(50) NOT NULL DEFAULT 'active',
  priority varchar(20) NOT NULL DEFAULT 'medium',
  case_type varchar(100),
  jurisdiction varchar(200),
  filed_date timestamptz,
  closed_date timestamptz,
  created_by integer NOT NULL,
  assigned_to integer,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.yorha_evidence_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  title varchar(500) NOT NULL,
  description text,
  evidence_type varchar(100) NOT NULL,
  position_x integer DEFAULT 0,
  position_y integer DEFAULT 0,
  color varchar(20) DEFAULT 'blue',
  icon varchar(100),
  source varchar(500),
  date_collected timestamptz,
  relevance_score integer DEFAULT 0,
  file_path varchar(1000),
  file_type varchar(100),
  file_size integer,
  ai_summary text,
  ai_tags jsonb,
  key_entities jsonb,
  status varchar(50) NOT NULL DEFAULT 'active',
  created_by integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.yorha_evidence_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  connection_type varchar(100) NOT NULL,
  strength integer DEFAULT 50,
  description text,
  ai_reasoning text,
  confidence_score integer DEFAULT 0,
  created_by integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_docs_jurisdiction_idx ON public.library_documents (jurisdiction_id);
CREATE INDEX IF NOT EXISTS library_docs_corpus_idx ON public.library_documents (corpus_type);
CREATE INDEX IF NOT EXISTS library_docs_status_idx ON public.library_documents (processing_status);
CREATE UNIQUE INDEX IF NOT EXISTS library_docs_source_hash_uidx
  ON public.library_documents (source_hash) WHERE source_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS legal_nodes_doc_idx ON public.legal_nodes (document_id);
CREATE INDEX IF NOT EXISTS legal_nodes_parent_idx ON public.legal_nodes (parent_node_id);
CREATE INDEX IF NOT EXISTS legal_nodes_path_idx ON public.legal_nodes (document_id, node_path);
CREATE INDEX IF NOT EXISTS legal_nodes_tsv_idx ON public.legal_nodes USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_legal_nodes_tags ON public.legal_nodes USING gin (tags_json);

CREATE INDEX IF NOT EXISTS legal_chunks_node_idx ON public.legal_chunks (legal_node_id);
CREATE INDEX IF NOT EXISTS legal_chunks_tsv_idx ON public.legal_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS legal_chunks_embed_hnsw
  ON public.legal_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_legal_chunks_qdrant
  ON public.legal_chunks (qdrant_point_id) WHERE qdrant_point_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS legal_defs_term_idx ON public.legal_definitions (normalized_term);
CREATE INDEX IF NOT EXISTS case_lib_links_case_idx ON public.case_library_links (case_id);
CREATE INDEX IF NOT EXISTS case_lib_links_doc_idx ON public.case_library_links (document_id);
CREATE INDEX IF NOT EXISTS case_lib_links_node_idx ON public.case_library_links (node_id);
CREATE INDEX IF NOT EXISTS ingestion_jobs_doc_idx ON public.ingestion_jobs (document_id);
CREATE INDEX IF NOT EXISTS ingestion_jobs_status_idx ON public.ingestion_jobs (status);
CREATE INDEX IF NOT EXISTS evidence_relationships_case_id_idx ON public.evidence_relationships (case_id);
CREATE INDEX IF NOT EXISTS evidence_relationships_from_idx ON public.evidence_relationships (from_evidence_id);
CREATE INDEX IF NOT EXISTS evidence_relationships_to_idx ON public.evidence_relationships (to_evidence_id);
CREATE INDEX IF NOT EXISTS citation_collections_user_id_idx ON public.citation_collections (user_id);
CREATE INDEX IF NOT EXISTS citation_tags_citation_id_idx ON public.citation_tags (citation_id);
CREATE INDEX IF NOT EXISTS document_topics_document_id_idx ON public.document_topics (document_id);
CREATE INDEX IF NOT EXISTS document_topics_topic_id_idx ON public.document_topics (topic_id);
CREATE INDEX IF NOT EXISTS embedding_cache_embedding_hnsw
  ON public.embedding_cache USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
CREATE INDEX IF NOT EXISTS legal_glossary_embedding_hnsw
  ON public.legal_glossary USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
CREATE INDEX IF NOT EXISTS yorha_cases_case_number_idx ON public.yorha_cases (case_number);
CREATE INDEX IF NOT EXISTS yorha_cases_created_by_idx ON public.yorha_cases (created_by);
CREATE INDEX IF NOT EXISTS yorha_cases_status_idx ON public.yorha_cases (status);
CREATE INDEX IF NOT EXISTS yorha_evidence_nodes_case_id_idx ON public.yorha_evidence_nodes (case_id);
CREATE INDEX IF NOT EXISTS yorha_evidence_nodes_type_idx ON public.yorha_evidence_nodes (evidence_type);
CREATE INDEX IF NOT EXISTS yorha_evidence_nodes_created_by_idx ON public.yorha_evidence_nodes (created_by);
CREATE INDEX IF NOT EXISTS yorha_evidence_connections_case_id_idx ON public.yorha_evidence_connections (case_id);
CREATE INDEX IF NOT EXISTS yorha_evidence_connections_source_idx ON public.yorha_evidence_connections (source_node_id);
CREATE INDEX IF NOT EXISTS yorha_evidence_connections_target_idx ON public.yorha_evidence_connections (target_node_id);
CREATE INDEX IF NOT EXISTS yorha_evidence_connections_type_idx ON public.yorha_evidence_connections (connection_type);

CREATE OR REPLACE FUNCTION public.legal_nodes_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.heading, '') || ' ' || coalesce(NEW.text_clean, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS legal_nodes_tsv_trigger ON public.legal_nodes;
CREATE TRIGGER legal_nodes_tsv_trigger
  BEFORE INSERT OR UPDATE ON public.legal_nodes
  FOR EACH ROW EXECUTE FUNCTION public.legal_nodes_tsv_update();

CREATE OR REPLACE FUNCTION public.legal_chunks_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.chunk_text, '') || ' ' || coalesce(NEW.summary, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS legal_chunks_tsv_trigger ON public.legal_chunks;
CREATE TRIGGER legal_chunks_tsv_trigger
  BEFORE INSERT OR UPDATE ON public.legal_chunks
  FOR EACH ROW EXECUTE FUNCTION public.legal_chunks_tsv_update();

UPDATE public.legal_nodes
SET tsv = to_tsvector('english', coalesce(heading, '') || ' ' || coalesce(text_clean, ''))
WHERE tsv IS NULL;

UPDATE public.legal_chunks
SET tsv = to_tsvector('english', coalesce(chunk_text, '') || ' ' || coalesce(summary, ''))
WHERE tsv IS NULL;

INSERT INTO public.jurisdictions (id, code, name, level, parent_id) VALUES
  (1, 'federal', 'Federal', 'federal', NULL),
  (2, 'ca', 'California', 'state', NULL),
  (3, 'ny', 'New York', 'state', NULL),
  (4, 'tx', 'Texas', 'state', NULL),
  (5, 'fl', 'Florida', 'state', NULL),
  (6, 'il', 'Illinois', 'state', NULL),
  (7, 'wa', 'Washington', 'state', NULL),
  (8, 'or', 'Oregon', 'state', NULL),
  (9, 'co', 'Colorado', 'state', NULL),
  (10, 'az', 'Arizona', 'state', NULL)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    level = EXCLUDED.level,
    parent_id = EXCLUDED.parent_id;

SELECT setval('public.jurisdictions_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.jurisdictions), 1), 10), true);