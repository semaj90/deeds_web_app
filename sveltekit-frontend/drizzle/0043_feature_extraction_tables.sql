-- Feature Extraction Tables (Schema Alignment)
-- Phase 107+: Support canonical packet_key join for materializers
-- Created: 2026-07-21
-- Purpose: Bridge between atlas_packets and derived enrichment projections

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. feature_structural (AST extraction - replaces feature_implementations misalignment)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_structural (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  source_ref TEXT NOT NULL,

  -- AST symbols extracted from code
  symbol_name TEXT[] DEFAULT '{}',        -- function, class, variable names
  symbol_kind TEXT[] DEFAULT '{}',        -- kind of symbol (function, class, interface, etc.)

  -- Structural facts
  ast_facts TEXT[] DEFAULT '{}',          -- export, interface, decorator, etc.
  tree_depth INTEGER DEFAULT 0,           -- max depth in AST
  node_count INTEGER DEFAULT 0,           -- total AST nodes

  -- Metadata
  language TEXT DEFAULT 'typescript',
  extraction_method TEXT DEFAULT 'tree-sitter',
  confidence REAL DEFAULT 1.0,
  materialization_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(packet_key, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_feature_structural_packet_key
  ON feature_structural (packet_key);
CREATE INDEX IF NOT EXISTS idx_feature_structural_source_ref
  ON feature_structural (source_ref);
CREATE INDEX IF NOT EXISTS idx_feature_structural_symbol_name
  ON feature_structural USING GIN (symbol_name);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. feature_lexical (Lexical extraction - domain keywords, BM25 terms, identifiers)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_lexical (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  source_ref TEXT NOT NULL,

  -- Lexical facts
  keywords TEXT[] DEFAULT '{}',          -- domain keywords (legal, evidence, case, etc.)
  bm25_terms TEXT[] DEFAULT '{}',        -- BM25-optimized terms for full-text search
  identifiers TEXT[] DEFAULT '{}',       -- variable, function, class identifiers
  file_tokens TEXT[] DEFAULT '{}',       -- tokenized file content (top-N frequent)

  -- Statistics
  token_count INTEGER DEFAULT 0,
  unique_tokens INTEGER DEFAULT 0,
  keyword_density REAL DEFAULT 0.0,      -- keywords / total_tokens

  -- Metadata
  extraction_method TEXT DEFAULT 'regex-tokenizer',
  confidence REAL DEFAULT 1.0,
  materialization_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(packet_key, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_feature_lexical_packet_key
  ON feature_lexical (packet_key);
CREATE INDEX IF NOT EXISTS idx_feature_lexical_source_ref
  ON feature_lexical (source_ref);
CREATE INDEX IF NOT EXISTS idx_feature_lexical_keywords
  ON feature_lexical USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_feature_lexical_bm25
  ON feature_lexical USING GIN (bm25_terms);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. feature_domain (Domain classification - single source for domain_class)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_domain (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  source_ref TEXT NOT NULL,

  -- Domain classification (canonical)
  domain_class TEXT NOT NULL,            -- legal, technical, ui, data, etc.

  -- Classification chain (for audit)
  primary_source TEXT DEFAULT 'canonical',  -- where did this classification come from?
  secondary_sources TEXT[] DEFAULT '{}',    -- fallback sources for consensus

  -- Confidence
  confidence REAL NOT NULL DEFAULT 1.0,  -- [0.0, 1.0]
  confidence_method TEXT DEFAULT 'canonical',  -- canonical, rule-based, ml-model, consensus

  -- Metadata
  materialization_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(packet_key, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_feature_domain_packet_key
  ON feature_domain (packet_key);
CREATE INDEX IF NOT EXISTS idx_feature_domain_source_ref
  ON feature_domain (source_ref);
CREATE INDEX IF NOT EXISTS idx_feature_domain_class
  ON feature_domain (domain_class);
CREATE INDEX IF NOT EXISTS idx_feature_domain_confidence
  ON feature_domain (confidence DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Ontology Tuples linked to domain_class (subject/predicate/object from domain)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ontology_domain_tuples (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  domain_class TEXT NOT NULL,

  -- Semantic triple
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,

  -- Tuple classification
  tuple_type TEXT NOT NULL DEFAULT 'domain'
    CHECK (tuple_type IN ('domain', 'legal', 'technical', 'structural', 'semantic')),

  -- Confidence and provenance
  confidence REAL NOT NULL DEFAULT 0.8,  -- [0.5, 1.0]
  sources TEXT[] DEFAULT '{}',           -- extractors: 'domain-classifier', 'keyword-match', 'rule-based'
  corroboration_count INTEGER DEFAULT 1, -- how many sources confirm this tuple

  -- Metadata
  materialization_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Uniqueness: one tuple per (packet_key, domain_class, subject, predicate, object)
  UNIQUE(packet_key, domain_class, subject, predicate, object)
);

CREATE INDEX IF NOT EXISTS idx_ontology_domain_packet_key
  ON ontology_domain_tuples (packet_key);
CREATE INDEX IF NOT EXISTS idx_ontology_domain_class
  ON ontology_domain_tuples (domain_class);
CREATE INDEX IF NOT EXISTS idx_ontology_domain_subject
  ON ontology_domain_tuples (subject);
CREATE INDEX IF NOT EXISTS idx_ontology_domain_predicate
  ON ontology_domain_tuples (predicate);
CREATE INDEX IF NOT EXISTS idx_ontology_domain_tuple_type
  ON ontology_domain_tuples (tuple_type);
CREATE INDEX IF NOT EXISTS idx_ontology_domain_confidence
  ON ontology_domain_tuples (confidence DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Views for audit and monitoring
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW feature_extraction_coverage AS
SELECT
  'structural' AS extraction_type,
  COUNT(DISTINCT packet_key) AS packets_covered,
  COUNT(DISTINCT packet_key) * 100.0 / (SELECT COUNT(*) FROM atlas_packets) AS coverage_pct,
  AVG(node_count) AS avg_ast_nodes,
  MAX(updated_at) AS last_updated
FROM feature_structural
UNION ALL
SELECT
  'lexical' AS extraction_type,
  COUNT(DISTINCT packet_key),
  COUNT(DISTINCT packet_key) * 100.0 / (SELECT COUNT(*) FROM atlas_packets),
  AVG(token_count),
  MAX(updated_at)
FROM feature_lexical
UNION ALL
SELECT
  'domain' AS extraction_type,
  COUNT(DISTINCT packet_key),
  COUNT(DISTINCT packet_key) * 100.0 / (SELECT COUNT(*) FROM atlas_packets),
  COUNT(DISTINCT domain_class),
  MAX(updated_at)
FROM feature_domain;

CREATE OR REPLACE VIEW ontology_domain_coverage AS
SELECT
  domain_class,
  COUNT(DISTINCT packet_key) AS packets_with_domain,
  COUNT(*) AS total_tuples,
  COUNT(DISTINCT subject) AS unique_subjects,
  COUNT(DISTINCT predicate) AS unique_predicates,
  COUNT(DISTINCT object) AS unique_objects,
  AVG(confidence) AS avg_confidence,
  MIN(created_at) AS earliest_tuple,
  MAX(updated_at) AS latest_update
FROM ontology_domain_tuples
GROUP BY domain_class;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Backfill trigger: populate feature tables from atlas_packets on first run
-- ═══════════════════════════════════════════════════════════════════════════════

-- Note: Run this manually AFTER table creation to backfill from atlas_packets:
--
-- INSERT INTO feature_domain (packet_key, source_ref, domain_class, primary_source, confidence)
-- SELECT
--   packet_key,
--   source_ref,
--   COALESCE(domain_class, 'unknown') as domain_class,
--   'atlas_packets.domain_class' as primary_source,
--   1.0 as confidence
-- FROM atlas_packets
-- WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL
-- ON CONFLICT (packet_key, source_ref) DO NOTHING;
--
-- This ensures every packet has at least a domain classification to link ontology tuples.
