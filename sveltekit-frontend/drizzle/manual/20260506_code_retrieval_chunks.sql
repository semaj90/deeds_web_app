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
  v_tsq := websearch_to_tsquery('simple', p_query);

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

CREATE OR REPLACE FUNCTION search_code_hybrid_pg(
  p_query        TEXT,
  p_embedding    vector(768),
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
  semantic_score        FLOAT4,
  hybrid_score          FLOAT4,
  headline              TEXT
)
LANGUAGE plpgsql STABLE PARALLEL SAFE
AS $$
DECLARE
  v_tsq tsquery;
BEGIN
  v_tsq := websearch_to_tsquery('simple', p_query);

  -- CTE: lexical candidates (FTS, weight A/B/C from generated column)
  RETURN QUERY
  WITH lex AS (
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
      c.embedding,
      c.search_vector,
      ts_rank_cd(c.search_vector, v_tsq, 32)::FLOAT4 AS lscore
    FROM code_retrieval_chunks c
    WHERE
      c.search_vector @@ v_tsq
      AND (p_topo_class IS NULL OR c.topo_class = p_topo_class)
    ORDER BY lscore DESC
    LIMIT p_limit * 4
  ),
  sem AS (
    -- pgvector ANN rerank over lexical candidates (avoids full-table scan)
    SELECT
      l.stable_key,
      l.file_path,
      l.symbol_name,
      l.symbol_kind,
      l.language,
      l.content,
      l.tags,
      l.topo_class,
      l.graph_authority_score,
      l.lscore,
      (1 - (l.embedding <=> p_embedding))::FLOAT4    AS sscore,
      ts_headline('simple', l.content, v_tsq,
        'MaxFragments=2, MaxWords=30, MinWords=10, StartSel=<b>, StopSel=</b>'
      )                                               AS headline
    FROM lex l
    WHERE l.embedding IS NOT NULL
  )
  SELECT
    s.stable_key,
    s.file_path,
    s.symbol_name,
    s.symbol_kind,
    s.language,
    s.content,
    s.tags,
    s.topo_class,
    s.graph_authority_score,
    s.lscore,
    s.sscore,
    -- Weighted fusion: 0.35 lexical + 0.35 semantic + 0.20 authority (scaled) + 0.10 boost floor
    (0.35 * s.lscore + 0.35 * s.sscore
      + 0.20 * LEAST(s.graph_authority_score::FLOAT4 / 10.0, 1.0)
      + 0.10)::FLOAT4                                AS hybrid_score,
    s.headline
  FROM sem s
  ORDER BY hybrid_score DESC
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
