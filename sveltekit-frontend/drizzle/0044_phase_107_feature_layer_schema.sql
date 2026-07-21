-- Phase 107 Feature Layer Schema Alignment (Phase B: Additive Migration)
-- Created: 2026-07-21
-- Purpose: Add canonical join columns to existing tables, create missing feature fact tables
-- Authority: atlas_packets is canonical truth, feature tables are normalized projections

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE B: ADDITIVE ONLY (no renames, no drops, no constraints)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. Add canonical join columns to feature_implementations
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE feature_implementations
  ADD COLUMN IF NOT EXISTS packet_key text,
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS processing_pass_id uuid;

CREATE INDEX IF NOT EXISTS feature_implementations_packet_key_idx
  ON feature_implementations(packet_key)
  WHERE packet_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS feature_implementations_source_ref_idx
  ON feature_implementations(source_ref)
  WHERE source_ref IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. Add canonical join columns to feature_file_edges
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE feature_file_edges
  ADD COLUMN IF NOT EXISTS packet_key text,
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS feature_file_edges_packet_key_idx
  ON feature_file_edges(packet_key)
  WHERE packet_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS feature_file_edges_source_ref_idx
  ON feature_file_edges(source_ref)
  WHERE source_ref IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. feature_lexical_facts — lexical extraction (keywords, identifiers, symbols)
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_lexical_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  packet_key text NOT NULL,
  source_ref text NOT NULL,
  feature_key text,

  keywords text[] NOT NULL DEFAULT '{}',
  identifiers text[] NOT NULL DEFAULT '{}',
  symbols text[] NOT NULL DEFAULT '{}',
  imported_modules text[] NOT NULL DEFAULT '{}',

  lexical_summary text,
  language text DEFAULT 'typescript',

  content_hash text NOT NULL,
  extractor_version text NOT NULL DEFAULT 'phase-107-v1',
  processing_pass_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (packet_key, extractor_version, content_hash)
);

CREATE INDEX IF NOT EXISTS feature_lexical_facts_packet_key_idx
  ON feature_lexical_facts(packet_key);
CREATE INDEX IF NOT EXISTS feature_lexical_facts_source_ref_idx
  ON feature_lexical_facts(source_ref);
CREATE INDEX IF NOT EXISTS feature_lexical_facts_keywords_idx
  ON feature_lexical_facts USING GIN (keywords);
CREATE INDEX IF NOT EXISTS feature_lexical_facts_symbols_idx
  ON feature_lexical_facts USING GIN (symbols);

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. feature_domain_facts — domain classification with confidence
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_domain_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  packet_key text NOT NULL,
  source_ref text NOT NULL,
  feature_key text,

  domain_class text NOT NULL,
  domain_confidence real,
  domain_probabilities jsonb NOT NULL DEFAULT '{}'::jsonb,

  classifier_kind text NOT NULL DEFAULT 'legacy-backfill',
  classifier_version text NOT NULL DEFAULT 'atlas-packets-domain-class-v1',
  model_hash text,
  feature_contract_version text,

  content_hash text NOT NULL,
  processing_pass_id uuid,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (packet_key, classifier_version, content_hash)
);

CREATE INDEX IF NOT EXISTS feature_domain_facts_packet_key_idx
  ON feature_domain_facts(packet_key);
CREATE INDEX IF NOT EXISTS feature_domain_facts_source_ref_idx
  ON feature_domain_facts(source_ref);
CREATE INDEX IF NOT EXISTS feature_domain_facts_domain_class_idx
  ON feature_domain_facts(domain_class);
CREATE INDEX IF NOT EXISTS feature_domain_facts_confidence_idx
  ON feature_domain_facts(domain_confidence DESC);

-- ───────────────────────────────────────────────────────────────────────────────
-- 5. feature_structural_facts — AST and structural information
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_structural_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  packet_key text NOT NULL,
  source_ref text NOT NULL,
  feature_key text,

  tree_node_id text,
  symbol_name text,
  symbol_kind text,
  structural_path text[],
  line_start integer,
  line_end integer,

  imports text[] NOT NULL DEFAULT '{}',
  calls text[] NOT NULL DEFAULT '{}',
  exports text[] NOT NULL DEFAULT '{}',

  content_hash text NOT NULL,
  parser_version text NOT NULL DEFAULT 'tree-sitter-v0',
  processing_pass_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_structural_facts_packet_key_idx
  ON feature_structural_facts(packet_key);
CREATE INDEX IF NOT EXISTS feature_structural_facts_source_ref_idx
  ON feature_structural_facts(source_ref);
CREATE INDEX IF NOT EXISTS feature_structural_facts_symbol_name_idx
  ON feature_structural_facts(symbol_name);
CREATE INDEX IF NOT EXISTS feature_structural_facts_imports_idx
  ON feature_structural_facts USING GIN (imports);

-- ───────────────────────────────────────────────────────────────────────────────
-- 6. feature_ontology_tuples — subject/predicate/object relationships
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_ontology_tuples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  packet_key text NOT NULL,
  source_ref text NOT NULL,
  feature_key text,

  subject_type text NOT NULL,
  subject_id text NOT NULL,

  predicate text NOT NULL,

  object_type text NOT NULL,
  object_id text NOT NULL,
  object_value jsonb,

  confidence real NOT NULL DEFAULT 1.0,

  ontology_version text NOT NULL DEFAULT 'atlas-ontology-v1',
  extractor_version text NOT NULL DEFAULT 'phase-107-v1',
  processing_pass_id uuid,

  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz,
  valid_to timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (
    packet_key,
    subject_type,
    subject_id,
    predicate,
    object_type,
    object_id,
    ontology_version
  )
);

CREATE INDEX IF NOT EXISTS feature_ontology_tuples_packet_key_idx
  ON feature_ontology_tuples(packet_key);
CREATE INDEX IF NOT EXISTS feature_ontology_tuples_source_ref_idx
  ON feature_ontology_tuples(source_ref);
CREATE INDEX IF NOT EXISTS feature_ontology_tuples_subject_idx
  ON feature_ontology_tuples(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS feature_ontology_tuples_predicate_idx
  ON feature_ontology_tuples(predicate);
CREATE INDEX IF NOT EXISTS feature_ontology_tuples_object_idx
  ON feature_ontology_tuples(object_type, object_id);
CREATE INDEX IF NOT EXISTS feature_ontology_tuples_confidence_idx
  ON feature_ontology_tuples(confidence DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW feature_layer_coverage AS
SELECT
  'feature_implementations' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) AS packet_key_count,
  COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) AS source_ref_count,
  COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL THEN 1 END) AS both_count
FROM feature_implementations
UNION ALL
SELECT
  'feature_file_edges' AS table_name,
  COUNT(*),
  COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL THEN 1 END)
FROM feature_file_edges
UNION ALL
SELECT
  'feature_lexical_facts',
  COUNT(*),
  COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL THEN 1 END)
FROM feature_lexical_facts
UNION ALL
SELECT
  'feature_domain_facts',
  COUNT(*),
  COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL THEN 1 END)
FROM feature_domain_facts
UNION ALL
SELECT
  'feature_structural_facts',
  COUNT(*),
  COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL THEN 1 END)
FROM feature_structural_facts
UNION ALL
SELECT
  'feature_ontology_tuples',
  COUNT(*),
  COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END),
  COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL THEN 1 END)
FROM feature_ontology_tuples;
