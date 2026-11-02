-- Migration: 20261101_atlas_tool_manifest_vectors_v1.sql
-- Description: Creates canonical atlas_tool_manifest_vectors_v1 table for pgvector tool routing
-- AFC-E2E-97: Tool Manifest pgvector Store

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.atlas_tool_manifest_vectors_v1 (
  tool_name text PRIMARY KEY,
  namespace text,
  description text,
  embedding vector(768) NOT NULL,
  recipe_revision text,
  schema_checksum text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT clock_timestamp() NOT NULL,
  updated_at timestamptz DEFAULT clock_timestamp() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlas_tool_manifest_vectors_v1_embedding_hnsw
  ON public.atlas_tool_manifest_vectors_v1
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_atlas_tool_manifest_vectors_v1_namespace
  ON public.atlas_tool_manifest_vectors_v1 (namespace);

COMMENT ON TABLE public.atlas_tool_manifest_vectors_v1 IS
  'Canonical MCP tool manifest vectors for pgvector tool routing (AFC-E2E-97). Supports exact cosine and HNSW scans.';
