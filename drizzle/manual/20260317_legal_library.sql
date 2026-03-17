-- Legal Library Schema (Phase 105)
-- Adds a document-centric legal corpus layer on top of the existing statutes/citations tables.
-- Reuses pgvector (already enabled), Qdrant (via application layer), and Neo4j (via app sync).

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM (
    'upload',
    'govinfo',
    'state_official',
    'openstates',
    'lii_reference'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE corpus_type AS ENUM (
    'constitution',
    'statute',
    'regulation',
    'bill',
    'case',
    'glossary',
    'treatise',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE legal_node_type AS ENUM (
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
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE processing_status AS ENUM (
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
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Jurisdictions lookup
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jurisdictions (
  id bigserial PRIMARY KEY,
  code text UNIQUE NOT NULL,   -- federal, ca, ny, tx …
  name text NOT NULL,
  level text NOT NULL          -- federal, state, local
);

INSERT INTO jurisdictions (code, name, level) VALUES
  ('federal', 'Federal', 'federal'),
  ('ca', 'California', 'state'),
  ('ny', 'New York', 'state'),
  ('tx', 'Texas', 'state'),
  ('fl', 'Florida', 'state'),
  ('il', 'Illinois', 'state'),
  ('wa', 'Washington', 'state'),
  ('or', 'Oregon', 'state'),
  ('co', 'Colorado', 'state'),
  ('az', 'Arizona', 'state')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Library documents (separate from the evidence-pipeline "documents" table)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS library_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type source_type NOT NULL DEFAULT 'upload',
  corpus_type corpus_type NOT NULL DEFAULT 'other',
  jurisdiction_id bigint REFERENCES jurisdictions(id),
  title text NOT NULL,
  short_title text,
  citation text,                    -- "Cal. Const." / "18 U.S.C."
  official_url text,
  source_hash text,                 -- SHA-256 of original file
  mime_type text DEFAULT 'application/pdf',
  minio_key text NOT NULL,          -- uploads/raw/{id}.pdf
  page_count int,
  effective_date date,
  updated_at_source timestamptz,
  is_official boolean DEFAULT false,
  processing_status processing_status NOT NULL DEFAULT 'queued',
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_docs_jurisdiction_idx ON library_documents(jurisdiction_id);
CREATE INDEX IF NOT EXISTS library_docs_corpus_idx ON library_documents(corpus_type);
CREATE INDEX IF NOT EXISTS library_docs_status_idx ON library_documents(processing_status);
CREATE UNIQUE INDEX IF NOT EXISTS library_docs_source_hash_uidx ON library_documents(source_hash) WHERE source_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Document versions (track amendments / effective dates)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS library_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
  version_label text,               -- "2024 Amendment", "v1"
  source_date date,
  is_current boolean DEFAULT false,
  parent_version_id uuid REFERENCES library_document_versions(id),
  diff_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Legal hierarchy nodes (Article / Chapter / Section / Subsection …)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
  version_id uuid REFERENCES library_document_versions(id) ON DELETE CASCADE,
  parent_node_id uuid REFERENCES legal_nodes(id) ON DELETE CASCADE,
  node_type legal_node_type NOT NULL DEFAULT 'section',
  ordinal text,                     -- I, 1, (a), (1)
  heading text,
  citation_label text,              -- "Art. I, § 1"
  node_path text NOT NULL,          -- "article-i/section-1"
  depth int NOT NULL DEFAULT 0,
  page_start int,
  page_end int,
  char_start int,
  char_end int,
  full_text text NOT NULL,
  text_clean text NOT NULL,
  tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_nodes_doc_idx ON legal_nodes(document_id);
CREATE INDEX IF NOT EXISTS legal_nodes_parent_idx ON legal_nodes(parent_node_id);
CREATE INDEX IF NOT EXISTS legal_nodes_path_idx ON legal_nodes(document_id, node_path);
CREATE INDEX IF NOT EXISTS legal_nodes_tsv_idx ON legal_nodes USING gin(tsv);

-- Auto-update tsvector on insert/update
CREATE OR REPLACE FUNCTION legal_nodes_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.heading, '') || ' ' || coalesce(NEW.text_clean, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS legal_nodes_tsv_trigger ON legal_nodes;
CREATE TRIGGER legal_nodes_tsv_trigger
  BEFORE INSERT OR UPDATE ON legal_nodes
  FOR EACH ROW EXECUTE FUNCTION legal_nodes_tsv_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- Chunks (section → chunk → embedding)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_node_id uuid NOT NULL REFERENCES legal_nodes(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  chunk_text text NOT NULL,
  token_count int,
  page_start int,
  page_end int,
  char_start int,
  char_end int,
  embedding vector(768),            -- embeddinggemma:latest
  tsv tsvector,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legal_node_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS legal_chunks_node_idx ON legal_chunks(legal_node_id);
CREATE INDEX IF NOT EXISTS legal_chunks_tsv_idx ON legal_chunks USING gin(tsv);
CREATE INDEX IF NOT EXISTS legal_chunks_embed_hnsw ON legal_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─────────────────────────────────────────────────────────────────────────────
-- Definitions (glossary terms defined within documents)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  normalized_term text NOT NULL,
  defined_in_node_id uuid NOT NULL REFERENCES legal_nodes(id) ON DELETE CASCADE,
  definition_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_defs_term_idx ON legal_definitions(normalized_term);

-- ─────────────────────────────────────────────────────────────────────────────
-- Page artifacts (per-page extraction bookkeeping)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  image_minio_key text,             -- processed/pages/{docId}/page-0001.webp
  extracted_text text,              -- native PDF text
  ocr_text text,                    -- Tesseract output
  final_text text,                  -- best of native vs OCR
  has_native_text boolean DEFAULT false,
  ocr_confidence numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS page_artifacts_doc_idx ON page_artifacts(document_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Ingestion jobs (stage-tracked pipeline progress)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
  stage processing_status NOT NULL DEFAULT 'queued',
  status text NOT NULL DEFAULT 'running',  -- running, failed, complete
  progress numeric(5,2) DEFAULT 0,
  error_text text,
  metrics_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_doc_idx ON ingestion_jobs(document_id);
CREATE INDEX IF NOT EXISTS ingestion_jobs_status_idx ON ingestion_jobs(status);
