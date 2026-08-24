-- Include parsed AST identifiers in the canonical PostgreSQL BM25 lane.
-- Postgres remains the BM25 owner; Qdrant and Valkey remain projections.

CREATE OR REPLACE FUNCTION codebase_chunk_ast_terms(p_values jsonb)
RETURNS text AS $$
  SELECT COALESCE(string_agg(
    COALESCE(
      value ->> 'name',
      value ->> 'kind',
      CASE WHEN jsonb_typeof(value) = 'string' THEN trim(both '"' from value::text) END,
      ''
    ),
    ' '
  ), '')
  FROM jsonb_array_elements(COALESCE(p_values, '[]'::jsonb)) AS item(value)
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION compute_codebase_chunk_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.relative_path, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.symbol, '')), 'A') ||
    setweight(to_tsvector('simple', codebase_chunk_ast_terms(NEW.ast_symbols)), 'A') ||
    setweight(to_tsvector('simple', array_to_string(COALESCE(NEW.ast_imports, ARRAY[]::text[]), ' ')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(COALESCE(NEW.ast_exports, ARRAY[]::text[]), ' ')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(COALESCE(NEW.semantic_tags, ARRAY[]::text[]), ' ')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_update_codebase_chunk_search_vector ON codebase_chunk_index;

CREATE TRIGGER trig_update_codebase_chunk_search_vector
BEFORE INSERT OR UPDATE ON codebase_chunk_index
FOR EACH ROW
EXECUTE FUNCTION compute_codebase_chunk_search_vector();

UPDATE codebase_chunk_index
SET search_vector =
  setweight(to_tsvector('english', COALESCE(relative_path, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(symbol, '')), 'A') ||
  setweight(to_tsvector('simple', codebase_chunk_ast_terms(ast_symbols)), 'A') ||
  setweight(to_tsvector('simple', array_to_string(COALESCE(ast_imports, ARRAY[]::text[]), ' ')), 'B') ||
  setweight(to_tsvector('simple', array_to_string(COALESCE(ast_exports, ARRAY[]::text[]), ' ')), 'B') ||
  setweight(to_tsvector('english', COALESCE(summary, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C') ||
  setweight(to_tsvector('english', array_to_string(COALESCE(semantic_tags, ARRAY[]::text[]), ' ')), 'B')
WHERE jsonb_array_length(COALESCE(ast_symbols, '[]'::jsonb)) > 0
   OR cardinality(COALESCE(ast_imports, ARRAY[]::text[])) > 0
   OR cardinality(COALESCE(ast_exports, ARRAY[]::text[])) > 0;

SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE search_vector IS NOT NULL) AS searchable_rows,
  COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(ast_symbols, '[]'::jsonb)) > 0) AS ast_symbol_rows
FROM codebase_chunk_index;
