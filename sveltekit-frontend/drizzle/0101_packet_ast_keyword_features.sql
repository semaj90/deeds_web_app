-- Phase: Feature extraction layer (classifier feature enrichment)
-- Purpose: Store extracted AST keywords, domain classification, and feature signals per packet
-- Schema: Indexed by packet_key for fast joins to atlas_packets
-- Note: This is the canonical feature table for the XGBoost classifier

CREATE TABLE IF NOT EXISTS packet_ast_keyword_features (
  id SERIAL PRIMARY KEY,
  packet_key VARCHAR(255) NOT NULL UNIQUE,
  source_ref VARCHAR(2048),

  -- Domain classification (classifier 11th feature)
  predicted_domain VARCHAR(50),
  domain_confidence REAL,
  domain_detection_method VARCHAR(50),  -- 'keyword', 'ast_grep', 'hybrid'

  -- Raw extraction signals
  keywords TEXT[],
  keyword_count INTEGER,
  keyword_coverage REAL,  -- % of known keywords found

  -- AST-level signals
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

  -- Classification confidence / debug
  keyword_counts JSONB,  -- { auth: N, ui: N, retrieval: N, ... } per domain

  -- Provenance
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  extraction_source VARCHAR(50),  -- 'rg', 'ast-grep', 'langextract'
  extraction_version VARCHAR(50),

  -- Validation gates
  validation_errors TEXT[],
  is_valid BOOLEAN DEFAULT TRUE,
  validation_gate TIMESTAMP WITH TIME ZONE,

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending',  -- pending, extracted, validated, backfilled
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT fk_packet_key FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE
);

-- Indexes for fast lookup and validation
CREATE INDEX IF NOT EXISTS idx_packet_ast_by_packet_key ON packet_ast_keyword_features(packet_key);
CREATE INDEX IF NOT EXISTS idx_packet_ast_by_domain ON packet_ast_keyword_features(predicted_domain);
CREATE INDEX IF NOT EXISTS idx_packet_ast_by_confidence ON packet_ast_keyword_features(domain_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_packet_ast_by_status ON packet_ast_keyword_features(status);
CREATE INDEX IF NOT EXISTS idx_packet_ast_keywords_gin ON packet_ast_keyword_features USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_packet_ast_symbols_gin ON packet_ast_keyword_features USING GIN(symbols);
