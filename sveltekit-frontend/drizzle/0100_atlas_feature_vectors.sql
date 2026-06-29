-- Feature Vectors Materialization Table
-- Purpose: Consolidate canonical features from atlas_packets + atlas_tree_nodes
--          for k-means clustering, SOM 20x20, and autoencoder training

CREATE TABLE IF NOT EXISTS atlas_feature_vectors (
  -- Identity
  packet_key TEXT PRIMARY KEY,
  source_ref TEXT NOT NULL,
  directory_path TEXT NOT NULL,
  tree_node_id UUID REFERENCES atlas_tree_nodes(node_id) ON DELETE SET NULL,

  -- Feature group membership
  feature_id TEXT NOT NULL,
  feature_label TEXT NOT NULL,
  domain_class TEXT,

  -- Extracted features (from keywords, summary, tags)
  keywords TEXT[] DEFAULT '{}',
  semantic_tags TEXT[] DEFAULT '{}',
  ontology_classes TEXT[] DEFAULT '{}',

  -- Computed graph features
  pagerank REAL,
  betweenness REAL,
  eigenvector REAL,

  -- Community & topology
  community_id INTEGER,
  som_cluster INTEGER,
  som_x INTEGER,
  som_y INTEGER,

  -- Vector representations metadata
  embedding_dim INTEGER DEFAULT 768,
  latent_64_dim INTEGER DEFAULT 64,

  -- Lineage & metadata
  feature_extraction_version TEXT DEFAULT 'v1',
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_pagerank CHECK (pagerank IS NULL OR pagerank >= 0),
  CONSTRAINT valid_som_coords CHECK (
    (som_x IS NULL AND som_y IS NULL) OR
    (som_x IS NOT NULL AND som_y IS NOT NULL AND som_x >= 0 AND som_y >= 0 AND som_x < 20 AND som_y < 20)
  )
);

-- Indexes for identity & retrieval
CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_source_ref
  ON atlas_feature_vectors(source_ref);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_feature_id
  ON atlas_feature_vectors(feature_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_community_id
  ON atlas_feature_vectors(community_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_som_cluster
  ON atlas_feature_vectors(som_cluster);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_domain_class
  ON atlas_feature_vectors(domain_class);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_tree_node_id
  ON atlas_feature_vectors(tree_node_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_pagerank
  ON atlas_feature_vectors(pagerank DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_som_coords
  ON atlas_feature_vectors(som_x, som_y)
  WHERE som_x IS NOT NULL AND som_y IS NOT NULL;

-- GIN indexes for array searches
CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_keywords
  ON atlas_feature_vectors USING GIN(keywords);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_semantic_tags
  ON atlas_feature_vectors USING GIN(semantic_tags);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_ontology
  ON atlas_feature_vectors USING GIN(ontology_classes);

-- Composite index for common join patterns
CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors_identity
  ON atlas_feature_vectors(packet_key, source_ref, feature_id);
