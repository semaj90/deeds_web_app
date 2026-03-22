-- APPLIED -- DO NOT RE-RUN: migration already applied to legal_ai_db
-- ACE Web Ingestion Schema Migration
-- Creates tables for web ingestion, RAG, and KAG pipeline
-- Requires: PostgreSQL 17 with pgvector extension

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create ace_sources table
CREATE TABLE IF NOT EXISTS ace_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL DEFAULT 'web',
  canonical_url TEXT NOT NULL,
  title TEXT,
  domain TEXT,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_crawled TIMESTAMPTZ,
  crawl_status TEXT DEFAULT 'new',
  etag TEXT,
  content_hash TEXT
);

-- Create indexes for ace_sources
CREATE INDEX IF NOT EXISTS ace_sources_url_idx ON ace_sources(canonical_url);
CREATE INDEX IF NOT EXISTS ace_sources_domain_idx ON ace_sources(domain);
CREATE INDEX IF NOT EXISTS ace_sources_status_idx ON ace_sources(crawl_status);

-- Create ace_docs table
CREATE TABLE IF NOT EXISTS ace_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES ace_sources(id),
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  content_type TEXT,
  minio_raw_key TEXT NOT NULL,
  minio_clean_key TEXT,
  tokens INTEGER,
  lang TEXT,
  summary TEXT,
  summary_updated_at TIMESTAMPTZ
);

-- Create indexes for ace_docs
CREATE INDEX IF NOT EXISTS ace_docs_source_idx ON ace_docs(source_id);
CREATE INDEX IF NOT EXISTS ace_docs_fetched_idx ON ace_docs(fetched_at);

-- Create ace_chunks table
CREATE TABLE IF NOT EXISTS ace_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES ace_docs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding VECTOR(384),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for ace_chunks
CREATE INDEX IF NOT EXISTS ace_chunks_doc_idx ON ace_chunks(doc_id, chunk_index);

-- Create IVFFlat index for vector similarity search
-- Note: This requires at least 100 rows in the table to be effective
-- The index will be created but may not be used until sufficient data exists
CREATE INDEX IF NOT EXISTS ace_chunks_embedding_idx
ON ace_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists=100);

-- Create ace_entities table
CREATE TABLE IF NOT EXISTS ace_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES ace_docs(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_type TEXT,
  data JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for ace_entities
CREATE INDEX IF NOT EXISTS ace_entities_doc_idx ON ace_entities(doc_id);
CREATE INDEX IF NOT EXISTS ace_entities_entity_idx ON ace_entities(entity);
CREATE INDEX IF NOT EXISTS ace_entities_type_idx ON ace_entities(entity_type);

-- Create ace_edges table
CREATE TABLE IF NOT EXISTS ace_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src_entity TEXT NOT NULL,
  rel TEXT NOT NULL,
  dst_entity TEXT NOT NULL,
  doc_id UUID REFERENCES ace_docs(id),
  weight REAL DEFAULT 1.0,
  data JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for ace_edges
CREATE INDEX IF NOT EXISTS ace_edges_src_idx ON ace_edges(src_entity);
CREATE INDEX IF NOT EXISTS ace_edges_dst_idx ON ace_edges(dst_entity);
CREATE INDEX IF NOT EXISTS ace_edges_rel_idx ON ace_edges(rel);
CREATE INDEX IF NOT EXISTS ace_edges_doc_idx ON ace_edges(doc_id);

-- Analyze tables for query planner
ANALYZE ace_sources;
ANALYZE ace_docs;
ANALYZE ace_chunks;
ANALYZE ace_entities;
ANALYZE ace_edges;
