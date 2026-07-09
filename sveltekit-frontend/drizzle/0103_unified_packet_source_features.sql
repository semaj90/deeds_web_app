-- Phase: Unified dual-lane classifier (AST code lane + regex/NLP documentation lane)
-- Purpose: Single canonical table for all packet source classification, feature inference, and HMM state
-- Schema: Indexed by packet_key, feature_id, tree_node_id for XGBoost + HMM + RRF pipeline
-- Note: AST fields (symbols, imports, etc.) nullable for docs; source_kind fields nullable for code

CREATE TABLE IF NOT EXISTS packet_source_features (
  packet_key TEXT PRIMARY KEY,
  source_ref TEXT NOT NULL,

  -- Source kind classification (regex/NLP lane for docs; implicit 'code' for .ts/.js/.svelte/.go)
  source_kind TEXT NOT NULL DEFAULT 'unknown',  -- code|spec|recommendation|user_note|ai_generated|handoff|test_log|config|unknown
  is_markdown BOOLEAN DEFAULT false,
  is_txt BOOLEAN DEFAULT false,
  is_code BOOLEAN DEFAULT false,

  -- Confidence scores per source type (documentation lane)
  ai_generated_score REAL DEFAULT 0,
  hand_made_score REAL DEFAULT 0,
  spec_score REAL DEFAULT 0,
  recommendation_score REAL DEFAULT 0,

  -- Domain classification (both lanes)
  predicted_domain VARCHAR(50),
  domain_confidence REAL,
  domain_detection_method VARCHAR(50),  -- 'keyword', 'ast_grep', 'regex', 'nlp', 'hybrid'

  -- Feature identity (derived from source_kind + predicted_domain + keywords)
  feature_id TEXT,
  feature_label TEXT,
  tree_node_id TEXT,
  inferred_domain TEXT,
  hmm_state TEXT,  -- CANONICAL|RECOVERABLE|UNKNOWN

  -- Raw extraction signals (AST lane — nullable for docs)
  keywords TEXT[],
  keyword_count INTEGER,
  keyword_coverage REAL,
  keyword_counts JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { auth: N, ui: N, retrieval: N, ... }

  -- AST-level signals (code lane only — nullable for docs)
  symbols TEXT[],
  symbol_count INTEGER,
  imports TEXT[],
  imports_count INTEGER,
  exports TEXT[],
  exports_count INTEGER,
  functions TEXT[],
  functions_count INTEGER,
  classes TEXT[],
  classes_count INTEGER,
  interfaces TEXT[],
  interfaces_count INTEGER,

  -- NLP/regex signals (documentation lane — nullable for code)
  regex_hits JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { 'spec_regex': [...], 'recommendation_regex': [...] }
  nlp_tags TEXT[] DEFAULT '{}',

  -- Derived fields for HyperRAG
  derived_title TEXT,
  semantic_title_id TEXT,

  -- Provenance
  extraction_source VARCHAR(50),  -- 'rg-keyword', 'ast-grep', 'regex-nlp', 'hybrid'
  extraction_version VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Validation gates
  validation_errors TEXT[],
  is_valid BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'pending',  -- pending, extracted, validated, backfilled

  CONSTRAINT fk_packet_key FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE
);

-- Indexes for fast lookup and filtering
CREATE INDEX IF NOT EXISTS packet_source_features_source_ref_idx
  ON packet_source_features(source_ref);

CREATE INDEX IF NOT EXISTS packet_source_features_kind_idx
  ON packet_source_features(source_kind);

CREATE INDEX IF NOT EXISTS packet_source_features_feature_idx
  ON packet_source_features(feature_id);

CREATE INDEX IF NOT EXISTS packet_source_features_tree_idx
  ON packet_source_features(tree_node_id);

CREATE INDEX IF NOT EXISTS packet_source_features_domain_idx
  ON packet_source_features(inferred_domain);

CREATE INDEX IF NOT EXISTS packet_source_features_hmm_idx
  ON packet_source_features(hmm_state);

CREATE INDEX IF NOT EXISTS packet_source_features_confidence_idx
  ON packet_source_features(domain_confidence DESC);

CREATE INDEX IF NOT EXISTS packet_source_features_status_idx
  ON packet_source_features(status);

-- GIN indexes for JSONB array searches
CREATE INDEX IF NOT EXISTS packet_source_features_regex_gin
  ON packet_source_features USING GIN(regex_hits jsonb_path_ops);

CREATE INDEX IF NOT EXISTS packet_source_features_tags_gin
  ON packet_source_features USING GIN(nlp_tags);

CREATE INDEX IF NOT EXISTS packet_source_features_keywords_gin
  ON packet_source_features USING GIN(keywords);

CREATE INDEX IF NOT EXISTS packet_source_features_symbols_gin
  ON packet_source_features USING GIN(symbols);

-- Composite index for HMM validation queries
CREATE INDEX IF NOT EXISTS packet_source_features_hmm_composite_idx
  ON packet_source_features(hmm_state, feature_id, tree_node_id);

-- Composite index for XGBoost feature queries
CREATE INDEX IF NOT EXISTS packet_source_features_xgboost_composite_idx
  ON packet_source_features(predicted_domain, domain_confidence, feature_id);
