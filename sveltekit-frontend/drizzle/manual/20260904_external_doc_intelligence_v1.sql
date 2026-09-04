-- parent-atlas-versioned-doc-intelligence (DOC-06 / DOC-06b): canonical Postgres owner for
-- external documentation pages and chunks. Per this repo's Postgres-is-truth hard rule, nothing
-- crawled by python/atlas_okf_docs_pipeline.py is promotable evidence until it has a row here --
-- Qdrant (external_programming_docs_768) and Neo4j stay rebuildable mirrors, never the source of
-- truth. Every row's identity is version-qualified (DocCoordinateV1: provider/product/
-- product_version/architecture/url/section_anchor) so a crawl under a different product_version
-- is always a distinct row, never an overwrite of a prior version's content.
--
-- Mirrors the code_retrieval_chunks (drizzle/manual/20260506_code_retrieval_chunks.sql) FTS/HNSW
-- pattern: GENERATED ALWAYS tsvector + GIN, pgvector HNSW, all indexes expressed here because
-- drizzle-kit cannot generate USING gin(...)/USING hnsw.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── atlas_external_doc_pages ────────────────────────────────────────────────────
-- One row per crawled page, per DocCoordinateV1 (page-level: section_anchor is NULL).

CREATE TABLE IF NOT EXISTS atlas_external_doc_pages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider              TEXT NOT NULL,
  product               TEXT NOT NULL,
  product_version       TEXT NOT NULL,
  architecture          TEXT,
  language              TEXT,
  url                   TEXT NOT NULL,
  title                 TEXT NOT NULL,
  publisher             TEXT,
  source_authority      TEXT NOT NULL DEFAULT 'OFFICIAL'
                          CHECK (source_authority IN ('OFFICIAL', 'COMMUNITY', 'THIRD_PARTY')),
  fetcher               TEXT NOT NULL,                 -- 'BEAUTIFULSOUP_HTTP' | 'FIRECRAWL_V2'
  crawl_revision        TEXT NOT NULL,
  parser_revision       TEXT NOT NULL,
  content_hash          TEXT NOT NULL,                 -- sha256 of normalized extracted text
  evidence_revision     TEXT NOT NULL,                 -- DocCoordinateV1.evidence_revision (page-level)
  retrieved_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Version-qualified identity is the whole point of DOC-02/DOC-27: the same (provider, product,
  -- product_version, url) must never collide across crawl runs, but re-crawling the identical
  -- version+url (content unchanged) should upsert, not duplicate.
  CONSTRAINT atlas_external_doc_pages_identity_uq
    UNIQUE (provider, product, product_version, url),
  CONSTRAINT atlas_external_doc_pages_evidence_revision_uq
    UNIQUE (evidence_revision)
);

CREATE INDEX IF NOT EXISTS aedp_product_version_arch
  ON atlas_external_doc_pages (product, product_version, architecture);

CREATE INDEX IF NOT EXISTS aedp_provider_product
  ON atlas_external_doc_pages (provider, product);

CREATE INDEX IF NOT EXISTS aedp_url_trgm
  ON atlas_external_doc_pages USING GIN (url gin_trgm_ops);

-- ── atlas_external_doc_chunks ───────────────────────────────────────────────────
-- One row per section chunk. Multiple representations: text (FTS below), content_embedding
-- (semantic_768, populated by DOC-07/DOC-08, nullable until then), qdrant_point_id (mirror
-- pointer once projected -- the chunk row is canonical regardless of whether it's been projected).

CREATE TABLE IF NOT EXISTS atlas_external_doc_chunks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id               UUID NOT NULL REFERENCES atlas_external_doc_pages(id) ON DELETE CASCADE,
  chunk_id              TEXT NOT NULL,                 -- matches ChunkRecord.chunk_id
  ordinal               INT NOT NULL,
  heading_path          TEXT[] NOT NULL DEFAULT '{}',
  section_anchor        TEXT,
  start_char            INT NOT NULL,
  end_char              INT NOT NULL,
  text                  TEXT NOT NULL,
  domain_class          TEXT NOT NULL,
  ontology_classes      TEXT[] NOT NULL DEFAULT '{}',
  code_blocks           JSONB NOT NULL DEFAULT '[]',   -- [{language, code}]
  api_signatures        TEXT[] NOT NULL DEFAULT '{}',
  domain_tags           TEXT[] NOT NULL DEFAULT '{}',
  symbols               TEXT[] NOT NULL DEFAULT '{}',  -- doc<->code mutual index (DOC-13)
  concept_ids           TEXT[] NOT NULL DEFAULT '{}',
  chunk_checksum        TEXT NOT NULL,                 -- sha256 of chunk text
  evidence_revision     TEXT NOT NULL,                 -- DocCoordinateV1.evidence_revision (chunk-level)
  content_embedding     vector(768),                   -- semantic_768; NULL until DOC-07 runs
  qdrant_point_id       TEXT,                           -- mirror pointer; NULL until DOC-08 projects it
  -- array_to_string() is STABLE (not IMMUTABLE) on this Postgres version -- confirmed live via
  -- `SELECT provolatile FROM pg_proc WHERE proname = 'array_to_string'` returning 's', not 'i' --
  -- so it cannot appear in a GENERATED ALWAYS ... STORED expression (Postgres requires every
  -- function in a generated column to be IMMUTABLE). heading_path/api_signatures/domain_tags are
  -- structured metadata, not prose, so they're indexed separately as GIN array-containment filters
  -- (below) rather than folded into this tsvector; the generated column covers prose only.
  search_vector         tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(text, ''))
  ) STORED,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_external_doc_chunks_chunk_id_uq UNIQUE (chunk_id),
  CONSTRAINT atlas_external_doc_chunks_evidence_revision_uq UNIQUE (evidence_revision)
);

CREATE INDEX IF NOT EXISTS aedc_page_id_ordinal
  ON atlas_external_doc_chunks (page_id, ordinal);

-- Primary lexical index (Postgres FTS projection, DOC-06b)
CREATE INDEX IF NOT EXISTS aedc_fts_gin
  ON atlas_external_doc_chunks USING GIN (search_vector);

-- Version/architecture-filtered candidate narrowing BEFORE semantic ranking -- design.md's
-- retrieval fan-out explicitly requires this filter to run before ANN, never after.
CREATE INDEX IF NOT EXISTS aedc_domain_tags_gin
  ON atlas_external_doc_chunks USING GIN (domain_tags);

CREATE INDEX IF NOT EXISTS aedc_symbols_gin
  ON atlas_external_doc_chunks USING GIN (symbols);

CREATE INDEX IF NOT EXISTS aedc_heading_path_gin
  ON atlas_external_doc_chunks USING GIN (heading_path);

CREATE INDEX IF NOT EXISTS aedc_api_signatures_gin
  ON atlas_external_doc_chunks USING GIN (api_signatures);

-- HNSW cosine index for local pgvector semantic search (mirrors code_retrieval_chunks' pattern).
-- m=16, ef_construction=64 -- same balanced defaults used elsewhere in this repo for 768-dim.
-- Populates lazily as content_embedding is backfilled by DOC-07; safe to create on an empty/sparse
-- column (HNSW handles NULLs by simply not indexing them).
CREATE INDEX IF NOT EXISTS aedc_embedding_hnsw
  ON atlas_external_doc_chunks USING hnsw (content_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
