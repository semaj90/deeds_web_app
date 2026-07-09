-- Phase: Dual-lane classifier (code + documentation)
-- Purpose: Store source kind classification + feature signals for .md/.txt/specs/recommendations
-- Schema: Indexed by packet_key, source_ref, feature_id, tree_node_id for HMM + RRF
-- Complements: packet_ast_keyword_features (code lane) + unified classifier pipeline

CREATE TABLE IF NOT EXISTS packet_source_features (
  packet_key TEXT PRIMARY KEY,
  source_ref TEXT NOT NULL,

  -- Source kind classification (regex/NLP lane for docs; AST lane for code)
  source_kind TEXT NOT NULL DEFAULT 'unknown',  -- code|spec|recommendation|user_note|ai_generated|handoff|test_log|config|unknown
  is_markdown BOOLEAN DEFAULT false,
  is_txt BOOLEAN DEFAULT false,
  is_code BOOLEAN DEFAULT false,

  -- Confidence scores per source type
  ai_generated_score REAL DEFAULT 0,
  hand_made_score REAL DEFAULT 0,
  spec_score REAL DEFAULT 0,
  recommendation_score REAL DEFAULT 0,

  -- Feature identity (derived from keywords + domain + source_kind)
  feature_id TEXT,
  feature_label TEXT,
  tree_node_id TEXT,
  inferred_domain TEXT,
  hmm_state TEXT,  -- CANONICAL|RECOVERABLE|UNKNOWN

  -- Signals from extraction
  keyword_counts JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { auth: N, ui: N, retrieval: N, ... }
  regex_hits JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { 'spec_regex': [...], 'recommendation_regex': [...] }
  nlp_tags TEXT[] DEFAULT '{}',

  -- Derived fields for HyperRAG
  derived_title TEXT,
  semantic_title_id TEXT,

  -- Provenance
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

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

-- GIN indexes for JSONB array searches
CREATE INDEX IF NOT EXISTS packet_source_features_regex_gin
  ON packet_source_features USING GIN(regex_hits jsonb_path_ops);

CREATE INDEX IF NOT EXISTS packet_source_features_tags_gin
  ON packet_source_features USING GIN(nlp_tags);

-- Composite index for HMM validation queries
CREATE INDEX IF NOT EXISTS packet_source_features_hmm_composite_idx
  ON packet_source_features(hmm_state, feature_id, tree_node_id);
