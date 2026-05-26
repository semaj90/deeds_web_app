-- Postgres 17 + pgvector hybrid retrieval table
-- Mirrors Qdrant codebase_chunks_768 with FTS + HNSW for local-first search

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Table ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS code_retrieval_chunks (
  id               BIGSERIAL PRIMARY KEY,
  stable_key       TEXT UNIQUE NOT NULL,
  qdrant_id        TEXT,
  file_path        TEXT NOT NULL,
  symbol_name      TEXT,
  symbol_kind      TEXT,
  language         TEXT,
  content          TEXT NOT NULL,
  tags             TEXT DEFAULT '',
  error_terms      TEXT DEFAULT '',
  tool_terms       TEXT DEFAULT '',
  topo_byte        INT,
  topo_hex         TEXT,
  topo_class       TEXT,
  manifold4_x      DOUBLE PRECISION,
  manifold4_y      DOUBLE PRECISION,
  manifold4_z      DOUBLE PRECISION,
  manifold4_w      DOUBLE PRECISION,
  graph_authority_score DOUBLE PRECISION DEFAULT 0,
  embedding        vector(768),
  search_vector    tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(file_path,    '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(symbol_name,  '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(symbol_kind,  '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(tags,         '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(error_terms,  '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(tool_terms,   '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content,     '')), 'C')
  ) STORED,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- GIN full-text search (primary lexical index)
CREATE INDEX IF NOT EXISTS crc_fts_gin
  ON code_retrieval_chunks USING GIN (search_vector);

-- HNSW for pgvector local semantic search
CREATE INDEX IF NOT EXISTS crc_embedding_hnsw
  ON code_retrieval_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- JSONB metadata for filter predicates
CREATE INDEX IF NOT EXISTS crc_metadata_gin
  ON code_retrieval_chunks USING GIN (metadata);

-- Topo-class equality filter (used by hybrid mode topo prefilter)
CREATE INDEX IF NOT EXISTS crc_topo_class
  ON code_retrieval_chunks (topo_class)
  WHERE topo_class IS NOT NULL;

-- Authority score for tie-breaking
CREATE INDEX IF NOT EXISTS crc_authority
  ON code_retrieval_chunks (graph_authority_score DESC NULLS LAST);

-- ── SQL function: lexical search ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_code_lexical(
  p_query        TEXT,
  p_limit        INT  DEFAULT 20,
  p_topo_class   TEXT DEFAULT NULL
)
RETURNS TABLE (
  stable_key            TEXT,
  file_path             TEXT,
  symbol_name           TEXT,
  symbol_kind           TEXT,
  language              TEXT,
  content               TEXT,
  tags                  TEXT,
  topo_class            TEXT,
  graph_authority_score DOUBLE PRECISION,
  lexical_score         FLOAT4,
  headline              TEXT
)
LANGUAGE plpgsql STABLE PARALLEL SAFE
AS $$
DECLARE
  v_tsq tsquery;
BEGIN
  -- 'simple' dictionary preserves camelCase tokens, dots, and path segments
  v_tsq := websearch_to_tsquery('english', p_query);

  RETURN QUERY
  SELECT
    c.stable_key,
    c.file_path,
    c.symbol_name,
    c.symbol_kind,
    c.language,
    c.content,
    c.tags,
    c.topo_class,
    c.graph_authority_score,
    ts_rank_cd(c.search_vector, v_tsq, 32)::FLOAT4   AS lexical_score,
    ts_headline('simple', c.content, v_tsq,
      'MaxFragments=2, MaxWords=30, MinWords=10, StartSel=<b>, StopSel=</b>'
    )                                                 AS headline
  FROM code_retrieval_chunks c
  WHERE
    c.search_vector @@ v_tsq
    AND (p_topo_class IS NULL OR c.topo_class = p_topo_class)
  ORDER BY
    lexical_score DESC,
    c.graph_authority_score DESC
  LIMIT p_limit;
END;
$$;

-- ── SQL function: hybrid FTS + pgvector rerank ────────────────────────────────

DROP FUNCTION IF EXISTS search_code_hybrid_pg(
  TEXT,
  vector(768),
  INT,
  TEXT
);

CREATE OR REPLACE FUNCTION search_code_hybrid_pg(
  p_query        TEXT,
  p_embedding    vector(768),
  p_limit        INT  DEFAULT 20,
  p_topo_class   TEXT DEFAULT NULL
)
RETURNS TABLE (
  stable_key   TEXT,
  path         TEXT,
  symbol       TEXT,
  content      TEXT,
  summary      TEXT,
  lex_rank     BIGINT,
  sem_rank     BIGINT,
  hybrid_score DOUBLE PRECISION
)
LANGUAGE plpgsql STABLE PARALLEL SAFE
AS $$
DECLARE
  v_tsq tsquery;
BEGIN
  v_tsq := websearch_to_tsquery('english', p_query);

  RETURN QUERY
  WITH lex AS (
    SELECT
      c.stable_key,
      ROW_NUMBER() OVER (
        ORDER BY
          c.fts_rank DESC,
          c.graph_authority_score DESC NULLS LAST,
          c.updated_at DESC
      ) AS lex_rank
    FROM (
      SELECT
        c_inner.stable_key,
        ts_rank_cd(c_inner.search_vector, v_tsq, 32)::FLOAT4 AS fts_rank,
        c_inner.graph_authority_score,
        c_inner.updated_at
      FROM code_retrieval_chunks c_inner
      WHERE c_inner.search_vector @@ v_tsq
        AND (p_topo_class IS NULL OR c_inner.topo_class = p_topo_class)
      ORDER BY fts_rank DESC
      LIMIT 200
    ) c
  ),
  sem AS (
    SELECT
      c.stable_key,
      ROW_NUMBER() OVER (
        ORDER BY c.emb_rank DESC, c.updated_at DESC
      ) AS sem_rank
    FROM (
      SELECT
        c_inner.stable_key,
        (1 - (c_inner.embedding <=> p_embedding))::FLOAT4 AS emb_rank,
        c_inner.updated_at
      FROM code_retrieval_chunks c_inner
      WHERE c_inner.embedding IS NOT NULL
        AND (p_topo_class IS NULL OR c_inner.topo_class = p_topo_class)
      ORDER BY c_inner.embedding <=> p_embedding ASC
      LIMIT 200
    ) c
  ),
  fused AS (
    SELECT
      coalesce(l.stable_key, s.stable_key) AS stable_key,
      l.lex_rank,
      s.sem_rank,
      (coalesce(1.0 / (60.0 + l.lex_rank), 0.0) + coalesce(1.0 / (60.0 + s.sem_rank), 0.0))::FLOAT4 AS hybrid_score
    FROM lex l
    FULL OUTER JOIN sem s ON l.stable_key = s.stable_key
  )
  SELECT
    c.stable_key,
    c.file_path AS path,
    c.symbol_name AS symbol,
    c.content,
    left(coalesce(c.content, ''), 280) AS summary,
    f.lex_rank,
    f.sem_rank,
    f.hybrid_score::double precision AS hybrid_score
  FROM fused f
  JOIN code_retrieval_chunks c ON f.stable_key = c.stable_key
  ORDER BY f.hybrid_score DESC
  LIMIT p_limit;
END;
$$;

-- ── Trigger: auto-update updated_at ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION crc_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crc_updated_at ON code_retrieval_chunks;
CREATE TRIGGER crc_updated_at
  BEFORE UPDATE ON code_retrieval_chunks
  FOR EACH ROW EXECUTE FUNCTION crc_set_updated_at();
