-- Unified Registry Enrichment Pipeline Projection Tables
-- Phase 107+: Four derived projections (NOT sources of truth)
-- Created: 2026-07-21

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. registry_enrichment_projection (cheap lanes: structural, lexical, domain)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS registry_enrichment_projection (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL UNIQUE,
  source_ref TEXT NOT NULL,

  -- Structural facts (AST)
  symbols TEXT[] DEFAULT '{}',           -- extracted symbols (function, class, var names)
  ast_facts TEXT[] DEFAULT '{}',         -- structural facts (export, interface, etc.)

  -- Lexical facts
  keywords TEXT[] DEFAULT '{}',          -- domain keywords (legal, evidence, etc.)
  bm25_terms TEXT[] DEFAULT '{}',        -- BM25 indexable terms
  identifiers TEXT[] DEFAULT '{}',       -- variable/function identifiers
  file_tokens TEXT[] DEFAULT '{}',       -- tokenized file content

  -- Domain classification
  domain_class TEXT,                      -- domain classification (legal, technical, etc.)

  -- Metadata
  materialization_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_packet_key
  ON registry_enrichment_projection (packet_key);
CREATE INDEX IF NOT EXISTS idx_enrichment_source_ref
  ON registry_enrichment_projection (source_ref);
CREATE INDEX IF NOT EXISTS idx_enrichment_domain_class
  ON registry_enrichment_projection (domain_class);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. registry_embedding_identity (embedding metadata, NOT vectors)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS registry_embedding_identity (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL UNIQUE,

  -- Embedding model metadata
  embedding_model TEXT NOT NULL DEFAULT 'embeddinggemma:latest',  -- canonical model
  embedding_dimension INTEGER NOT NULL DEFAULT 768,                -- 768-dim is canonical
  embedding_normalized BOOLEAN DEFAULT TRUE,                      -- L2 norm applied
  embedding_content_hash TEXT,                                     -- SHA-256 of normalized vector

  -- Qdrant mapping
  qdrant_point_id TEXT,                                            -- UUID in Qdrant
  qdrant_collection TEXT DEFAULT 'codebase_chunks_768',

  -- Metadata
  materialization_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embedding_packet_key
  ON registry_embedding_identity (packet_key);
CREATE INDEX IF NOT EXISTS idx_embedding_qdrant_point_id
  ON registry_embedding_identity (qdrant_point_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. registry_topology_projection (topology: tree node, community, PageRank, SOM, KMeans)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS registry_topology_projection (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL UNIQUE,

  -- AST tree node ID
  tree_node_id TEXT,

  -- Neo4j topology
  community_id INTEGER,                  -- from Neo4j graph traversal
  page_rank_score REAL,                  -- from GPU PageRank computation

  -- GPU clustering
  som_cluster TEXT,                      -- Self-Organizing Map cluster (grid position)
  kmeans_cluster INTEGER,                -- GPU KMeans cluster ID

  -- Metadata
  materialization_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topology_packet_key
  ON registry_topology_projection (packet_key);
CREATE INDEX IF NOT EXISTS idx_topology_community_id
  ON registry_topology_projection (community_id);
CREATE INDEX IF NOT EXISTS idx_topology_som_cluster
  ON registry_topology_projection (som_cluster);
CREATE INDEX IF NOT EXISTS idx_topology_kmeans_cluster
  ON registry_topology_projection (kmeans_cluster);
CREATE INDEX IF NOT EXISTS idx_topology_page_rank
  ON registry_topology_projection (page_rank_score);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. registry_ontology_tuples (ontology: subject/predicate/object with corroboration)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS registry_ontology_tuples (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,

  -- Tuple classification
  tuple_type TEXT NOT NULL
    CHECK (tuple_type IN ('ast', 'schema', 'research', 'verified', 'candidate')),

  -- Confidence and source tracking
  confidence REAL NOT NULL,                -- [0.5, 1.0] confidence score
  sources TEXT[] DEFAULT '{}',             -- extractors: 'ast-grep', 'tree-sitter', 'schema-analysis', 'firecrawl'
  corroboration_count INTEGER DEFAULT 0,   -- number of sources that confirm this tuple

  -- Metadata
  materialization_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Uniqueness constraint: one tuple per packet/subject/predicate/object combo
  UNIQUE (packet_key, subject, predicate, object)
);

CREATE INDEX IF NOT EXISTS idx_ontology_packet_key
  ON registry_ontology_tuples (packet_key);
CREATE INDEX IF NOT EXISTS idx_ontology_subject
  ON registry_ontology_tuples (subject);
CREATE INDEX IF NOT EXISTS idx_ontology_predicate
  ON registry_ontology_tuples (predicate);
CREATE INDEX IF NOT EXISTS idx_ontology_tuple_type
  ON registry_ontology_tuples (tuple_type);
CREATE INDEX IF NOT EXISTS idx_ontology_confidence
  ON registry_ontology_tuples (confidence DESC);
CREATE INDEX IF NOT EXISTS idx_ontology_corroboration
  ON registry_ontology_tuples (corroboration_count DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Schema validation views (for auditing)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW registry_projection_stats AS
SELECT
  'enrichment' AS projection_type,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT packet_key) AS unique_packets,
  MIN(created_at) AS first_materialized,
  MAX(updated_at) AS last_updated
FROM registry_enrichment_projection
UNION ALL
SELECT
  'embedding' AS projection_type,
  COUNT(*),
  COUNT(DISTINCT packet_key),
  MIN(created_at),
  MAX(updated_at)
FROM registry_embedding_identity
UNION ALL
SELECT
  'topology' AS projection_type,
  COUNT(*),
  COUNT(DISTINCT packet_key),
  MIN(created_at),
  MAX(updated_at)
FROM registry_topology_projection
UNION ALL
SELECT
  'ontology' AS projection_type,
  COUNT(*),
  COUNT(DISTINCT packet_key),
  MIN(created_at),
  MAX(updated_at)
FROM registry_ontology_tuples;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration metadata
-- ═══════════════════════════════════════════════════════════════════════════════
-- Created: 2026-07-21 (Session 139+ continuation)
-- Purpose: Support unified registry enrichment pipeline with four derived projections
-- Architecture: Postgres is canonical truth; these are VIEW-like materialized tables
-- Note: No independent authority — projections derive from atlas_packets + sources
