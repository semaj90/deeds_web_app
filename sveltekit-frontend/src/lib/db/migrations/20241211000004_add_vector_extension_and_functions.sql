-- Migration: 20241211000004_add_vector_extension_and_functions
-- Up

-- Enable vector extension for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector indexes for similarity search (using IVFFlat for performance)
CREATE INDEX IF NOT EXISTS idx_cases_vector_embedding ON cases USING ivfflat (vector_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_evidence_vector_embedding ON evidence USING ivfflat (vector_embedding vector_cosine_ops) WITH (lists = 100);

-- Create vector search functions for semantic similarity
CREATE OR REPLACE FUNCTION search_similar_cases(
  query_embedding vector(384),
  similarity_threshold float DEFAULT 0.7,
  limit_count integer DEFAULT 10
)
RETURNS TABLE(
  id integer,
  title text,
  description text,
  case_number text,
  status varchar(20),
  priority varchar(20),
  similarity float,
  created_at timestamp,
  updated_at timestamp
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.description,
    c.case_number,
    c.status,
    c.priority,
    1 - (c.vector_embedding <=> query_embedding) as similarity,
    c.created_at,
    c.updated_at
  FROM cases c
  WHERE c.vector_embedding IS NOT NULL
    AND 1 - (c.vector_embedding <=> query_embedding) > similarity_threshold
  ORDER BY c.vector_embedding <=> query_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION search_similar_evidence(
  query_embedding vector(384),
  similarity_threshold float DEFAULT 0.7,
  limit_count integer DEFAULT 10
)
RETURNS TABLE(
  id integer,
  case_id integer,
  title text,
  description text,
  evidence_type varchar(50),
  analysis_status varchar(20),
  similarity float,
  created_at timestamp,
  updated_at timestamp
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.case_id,
    e.title,
    e.description,
    e.evidence_type,
    e.analysis_status,
    1 - (e.vector_embedding <=> query_embedding) as similarity,
    e.created_at,
    e.updated_at
  FROM evidence e
  WHERE e.vector_embedding IS NOT NULL
    AND 1 - (e.vector_embedding <=> query_embedding) > similarity_threshold
  ORDER BY e.vector_embedding <=> query_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Cross-case evidence similarity function
CREATE OR REPLACE FUNCTION find_related_evidence(
  case_id_param integer,
  similarity_threshold float DEFAULT 0.7,
  limit_count integer DEFAULT 10
)
RETURNS TABLE(
  evidence_id integer,
  related_case_id integer,
  evidence_title text,
  case_title text,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e2.id as evidence_id,
    e2.case_id as related_case_id,
    e2.title as evidence_title,
    c2.title as case_title,
    1 - (e1.vector_embedding <=> e2.vector_embedding) as similarity
  FROM evidence e1
  JOIN cases c1 ON e1.case_id = c1.id
  JOIN evidence e2 ON e2.case_id != case_id_param
  JOIN cases c2 ON e2.case_id = c2.id
  WHERE e1.case_id = case_id_param
    AND e1.vector_embedding IS NOT NULL
    AND e2.vector_embedding IS NOT NULL
    AND 1 - (e1.vector_embedding <=> e2.vector_embedding) > similarity_threshold
  ORDER BY similarity DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Statistics function for dashboard
CREATE OR REPLACE FUNCTION get_vector_search_stats()
RETURNS TABLE(
  total_cases integer,
  cases_with_embeddings integer,
  total_evidence integer,
  evidence_with_embeddings integer,
  embedding_coverage_percent float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::integer FROM cases) as total_cases,
    (SELECT COUNT(*)::integer FROM cases WHERE vector_embedding IS NOT NULL) as cases_with_embeddings,
    (SELECT COUNT(*)::integer FROM evidence) as total_evidence,
    (SELECT COUNT(*)::integer FROM evidence WHERE vector_embedding IS NOT NULL) as evidence_with_embeddings,
    CASE
      WHEN (SELECT COUNT(*) FROM cases) + (SELECT COUNT(*) FROM evidence) = 0 THEN 0.0
      ELSE (
        (SELECT COUNT(*) FROM cases WHERE vector_embedding IS NOT NULL) +
        (SELECT COUNT(*) FROM evidence WHERE vector_embedding IS NOT NULL)
      )::float / (
        (SELECT COUNT(*) FROM cases) + (SELECT COUNT(*) FROM evidence)
      )::float * 100.0
    END as embedding_coverage_percent;
END;
$$ LANGUAGE plpgsql;

-- Down
DROP FUNCTION IF EXISTS get_vector_search_stats;
DROP FUNCTION IF EXISTS find_related_evidence;
DROP FUNCTION IF EXISTS search_similar_evidence;
DROP FUNCTION IF EXISTS search_similar_cases;
DROP INDEX IF EXISTS idx_evidence_vector_embedding;
DROP INDEX IF EXISTS idx_cases_vector_embedding;
