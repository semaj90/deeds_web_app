-- Migration: 0013_research_summaries
-- Unified research summaries table for web crawl, legal corpus, documents,
-- images, videos, reports, notes, and cases.
-- Special indexes (GIN trgm, GIN array, HNSW vector) expressed in raw SQL
-- because drizzle-kit cannot generate USING gin(..._ops) or USING hnsw.

-- Require pg_trgm for fuzzy DYM queries
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_summaries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,                           -- web|corpus|document|image|video|report|note|case
  pipeline        TEXT NOT NULL DEFAULT 'ace',
  entity_type     TEXT NOT NULL,                           -- same as source, filterable separately
  query           TEXT NOT NULL,
  query_hash      VARCHAR(8) NOT NULL,
  title           TEXT,
  url             TEXT,                                    -- web URL or MinIO object path
  collection      TEXT,                                    -- Qdrant collection (corpus only)
  citation_label  TEXT,
  section_path    TEXT,
  jurisdiction    TEXT,
  summary         TEXT NOT NULL,
  entity_tags     TEXT[] NOT NULL DEFAULT '{}',
  relevance_score REAL NOT NULL DEFAULT 0,
  embedding       vector(768),                             -- 768-dim embeddinggemma
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Keyset pagination indexes (O(1) seek, no OFFSET scan) ────────────────────
CREATE INDEX IF NOT EXISTS rs_pipeline_score_id
  ON research_summaries (pipeline, relevance_score DESC, id DESC);

CREATE INDEX IF NOT EXISTS rs_entity_type_score
  ON research_summaries (entity_type, relevance_score DESC, id DESC);

CREATE INDEX IF NOT EXISTS rs_source_score
  ON research_summaries (source, relevance_score DESC, id DESC);

CREATE INDEX IF NOT EXISTS rs_user_created
  ON research_summaries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rs_query_hash
  ON research_summaries (query_hash);

-- ── DYM: trigram fuzzy match on query ─────────────────────────────────────────
-- similarity(query, $1) > 0.25 with ORDER BY sim DESC — ~5ms on 100K rows
CREATE INDEX IF NOT EXISTS rs_query_trgm
  ON research_summaries USING GIN (query gin_trgm_ops);

-- ── Tag filter: GIN array containment (entity_tags @> ARRAY[$tag]) ────────────
CREATE INDEX IF NOT EXISTS rs_entity_tags_gin
  ON research_summaries USING GIN (entity_tags);

-- ── Semantic DYM: HNSW cosine index for vector similarity ────────────────────
-- m=16, ef_construction=64 — balanced for ~100K rows, 768-dim
CREATE INDEX IF NOT EXISTS rs_embedding_hnsw
  ON research_summaries USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── Full-text search on query + summary combined ──────────────────────────────
CREATE INDEX IF NOT EXISTS rs_fts
  ON research_summaries USING GIN (
    to_tsvector('english', coalesce(query, '') || ' ' || coalesce(summary, ''))
  );

-- ── saved_citation_id: link research summary → saved citation (nullable FK) ──
ALTER TABLE research_summaries
  ADD COLUMN IF NOT EXISTS saved_citation_id UUID
  REFERENCES citations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rs_saved_citation
  ON research_summaries (saved_citation_id)
  WHERE saved_citation_id IS NOT NULL;
