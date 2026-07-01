-- Repair Parent Atlas lexical search proof lane.
-- Keeps code_retrieval_chunks as-is and only broadens search_code_lexical()
-- from strict all-token websearch matching to ranked FTS plus lexical fallback.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.search_code_lexical(
  p_query text,
  p_limit integer DEFAULT 20,
  p_topo_class text DEFAULT NULL::text
)
RETURNS TABLE(
  stable_key text,
  file_path text,
  symbol_name text,
  symbol_kind text,
  language text,
  content text,
  tags text,
  topo_class text,
  graph_authority_score double precision,
  lexical_score real,
  headline text
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $function$
DECLARE
  v_query text := btrim(coalesce(p_query, ''));
  v_web tsquery;
  v_or tsquery;
BEGIN
  IF v_query = '' THEN
    RETURN;
  END IF;

  v_web := websearch_to_tsquery('simple', v_query);

  SELECT string_agg(quote_literal(tok) || ':*', ' | ')::tsquery
  INTO v_or
  FROM (
    SELECT DISTINCT regexp_replace(lower(tok), '[^a-z0-9_./:-]+', '', 'g') AS tok
    FROM regexp_split_to_table(v_query, '\s+') AS tok
  ) t
  WHERE length(tok) >= 2;

  RETURN QUERY
  WITH scored AS (
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
      CASE
        WHEN c.search_vector @@ v_web THEN ts_rank_cd(c.search_vector, v_web, 32)
        WHEN v_or IS NOT NULL AND c.search_vector @@ v_or THEN 0.55 * ts_rank_cd(c.search_vector, v_or, 32)
        ELSE 0
      END AS fts_score
    FROM code_retrieval_chunks c
    WHERE (p_topo_class IS NULL OR c.topo_class = p_topo_class)
      AND (
        c.search_vector @@ v_web
        OR (v_or IS NOT NULL AND c.search_vector @@ v_or)
      )
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
    s.fts_score::float4 AS lexical_score,
    CASE
      WHEN v_web IS NOT NULL THEN ts_headline(
        'simple',
        s.content,
        v_web,
        'MaxFragments=2, MaxWords=30, MinWords=10, StartSel=<b>, StopSel=</b>'
      )
      ELSE left(s.content, 240)
    END AS headline
  FROM scored s
  ORDER BY lexical_score DESC, graph_authority_score DESC NULLS LAST
  LIMIT greatest(1, p_limit);
END;
$function$;
