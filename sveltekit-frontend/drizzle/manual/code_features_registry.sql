-- Code Features Static Registry (ast-grep extracted features)
-- This is the canonical feature/module/function registry for unified retrieval

-- 1. code_features — canonical registry of code entities extracted by ast-grep
CREATE TABLE IF NOT EXISTS code_features (
  feature_id TEXT PRIMARY KEY NOT NULL,
  source_ref TEXT NOT NULL,
  symbol TEXT NOT NULL,
  kind TEXT NOT NULL,
  language TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  packet_key TEXT,
  domain_class TEXT,
  ontology_label TEXT,
  static_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  UNIQUE(source_ref, symbol, kind),
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key) ON DELETE SET NULL
);

-- 2. code_feature_edges — relationships between features (imports, defines, uses, etc.)
CREATE TABLE IF NOT EXISTS code_feature_edges (
  from_feature_id TEXT NOT NULL REFERENCES code_features(feature_id) ON DELETE CASCADE,
  to_feature_id TEXT NOT NULL REFERENCES code_features(feature_id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  evidence_ref TEXT,
  confidence REAL DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  PRIMARY KEY (from_feature_id, to_feature_id, relation),
  UNIQUE(from_feature_id, to_feature_id, relation)
);

-- 3. code_feature_embeddings — maps features to Qdrant points
CREATE TABLE IF NOT EXISTS code_feature_embeddings (
  feature_id TEXT PRIMARY KEY NOT NULL REFERENCES code_features(feature_id) ON DELETE CASCADE,
  embedding_model TEXT DEFAULT 'embeddinggemma:latest' NOT NULL,
  qdrant_id BIGINT NOT NULL UNIQUE,
  vector_name TEXT DEFAULT 'content' NOT NULL,
  vector_dim INTEGER DEFAULT 768,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_code_features_source_ref ON code_features(source_ref);
CREATE INDEX IF NOT EXISTS idx_code_features_symbol ON code_features(symbol);
CREATE INDEX IF NOT EXISTS idx_code_features_kind ON code_features(kind);
CREATE INDEX IF NOT EXISTS idx_code_features_language ON code_features(language);
CREATE INDEX IF NOT EXISTS idx_code_features_domain_class ON code_features(domain_class);
CREATE INDEX IF NOT EXISTS idx_code_features_ontology_label ON code_features(ontology_label);
CREATE INDEX IF NOT EXISTS idx_code_features_tags ON code_features USING GIN(static_tags);
CREATE INDEX IF NOT EXISTS idx_code_feature_edges_from ON code_feature_edges(from_feature_id);
CREATE INDEX IF NOT EXISTS idx_code_feature_edges_to ON code_feature_edges(to_feature_id);
CREATE INDEX IF NOT EXISTS idx_code_feature_edges_relation ON code_feature_edges(relation);
CREATE INDEX IF NOT EXISTS idx_code_feature_embeddings_model ON code_feature_embeddings(embedding_model);
