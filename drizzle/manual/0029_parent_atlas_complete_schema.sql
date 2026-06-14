-- Parent Atlas: Complete Schema (Phase D/E Foundation)
-- Adds tree nodes, glyphs, topology index, and summary layers
-- Pure SQL, no Drizzle dependencies

-- 1. Tree Nodes (PageIndex Hierarchy)
CREATE TABLE IF NOT EXISTS atlas_tree_nodes (
  node_id TEXT PRIMARY KEY,
  parent_id TEXT,
  root_id TEXT,

  node_type VARCHAR(50),
  title TEXT,

  source_ref TEXT UNIQUE,
  file_path TEXT,
  file_url TEXT,
  page_index_path TEXT,

  packet_key TEXT REFERENCES atlas_packets(packet_key) ON DELETE SET NULL,
  feature_id TEXT,
  feature_label TEXT,

  text TEXT,
  summary TEXT,

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tree_nodes_node_id ON atlas_tree_nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_tree_nodes_parent_id ON atlas_tree_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_tree_nodes_root_id ON atlas_tree_nodes(root_id);
CREATE INDEX IF NOT EXISTS idx_tree_nodes_packet_key ON atlas_tree_nodes(packet_key);
CREATE INDEX IF NOT EXISTS idx_tree_nodes_source_ref ON atlas_tree_nodes(source_ref);
CREATE INDEX IF NOT EXISTS idx_tree_nodes_feature_id ON atlas_tree_nodes(feature_id);
CREATE INDEX IF NOT EXISTS idx_tree_nodes_page_index_path ON atlas_tree_nodes(page_index_path);

-- 2. Tree Edges (Hierarchy Relationships)
CREATE TABLE IF NOT EXISTS atlas_tree_edges (
  source_id TEXT NOT NULL REFERENCES atlas_tree_nodes(node_id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES atlas_tree_nodes(node_id) ON DELETE CASCADE,
  edge_type VARCHAR(50),
  weight DOUBLE PRECISION DEFAULT 1.0,

  created_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY (source_id, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_tree_edges_source_id ON atlas_tree_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_tree_edges_target_id ON atlas_tree_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_tree_edges_edge_type ON atlas_tree_edges(edge_type);

-- 3. Glyph Records (UTF-8 / SVG / Glyphs)
CREATE TABLE IF NOT EXISTS atlas_glyph_records (
  glyph_id TEXT PRIMARY KEY,

  svg_text TEXT,
  utf8_text TEXT,
  unicode_codepoints TEXT,

  source_ref TEXT,
  packet_key TEXT REFERENCES atlas_packets(packet_key) ON DELETE CASCADE,
  feature_id TEXT,
  node_id TEXT REFERENCES atlas_tree_nodes(node_id) ON DELETE SET NULL,

  x_page INTEGER,
  y_page INTEGER,
  width INTEGER,
  height INTEGER,

  glyph_type VARCHAR(50),
  language VARCHAR(10) DEFAULT 'en',

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_glyph_records_packet_key ON atlas_glyph_records(packet_key);
CREATE INDEX IF NOT EXISTS idx_glyph_records_source_ref ON atlas_glyph_records(source_ref);
CREATE INDEX IF NOT EXISTS idx_glyph_records_feature_id ON atlas_glyph_records(feature_id);
CREATE INDEX IF NOT EXISTS idx_glyph_records_node_id ON atlas_glyph_records(node_id);
CREATE INDEX IF NOT EXISTS idx_glyph_records_glyph_type ON atlas_glyph_records(glyph_type);

-- 4. Topology Index (4D Coordinates)
CREATE TABLE IF NOT EXISTS atlas_topology_index (
  packet_key TEXT PRIMARY KEY REFERENCES atlas_packets(packet_key) ON DELETE CASCADE,

  x_cosine DOUBLE PRECISION,
  y_graph DOUBLE PRECISION,
  z_som DOUBLE PRECISION,
  w_authority DOUBLE PRECISION,

  som_row INTEGER,
  som_col INTEGER,
  som_cluster TEXT,
  community_id TEXT,

  feature_id TEXT,
  source_ref TEXT,

  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topology_packet_key ON atlas_topology_index(packet_key);
CREATE INDEX IF NOT EXISTS idx_topology_som_cluster ON atlas_topology_index(som_cluster);
CREATE INDEX IF NOT EXISTS idx_topology_community_id ON atlas_topology_index(community_id);
CREATE INDEX IF NOT EXISTS idx_topology_x_cosine ON atlas_topology_index(x_cosine);
CREATE INDEX IF NOT EXISTS idx_topology_w_authority ON atlas_topology_index(w_authority);
CREATE INDEX IF NOT EXISTS idx_topology_feature_id ON atlas_topology_index(feature_id);

-- 5. Summary Layers (Hierarchical Summaries)
CREATE TABLE IF NOT EXISTS atlas_summary_layers (
  packet_key TEXT NOT NULL REFERENCES atlas_packets(packet_key) ON DELETE CASCADE,
  layer_type VARCHAR(50) NOT NULL,

  summary TEXT,
  keywords TEXT[],
  entities TEXT[],

  embedding_model VARCHAR(255) DEFAULT 'embeddinggemma:latest',
  vector_dim INTEGER DEFAULT 768,

  created_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY (packet_key, layer_type)
);

CREATE INDEX IF NOT EXISTS idx_summary_layers_packet_key ON atlas_summary_layers(packet_key);
CREATE INDEX IF NOT EXISTS idx_summary_layers_layer_type ON atlas_summary_layers(layer_type);

-- 6. Enhanced atlas_packets Columns (if not already added via 0028)
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS packet_universe TEXT DEFAULT 'atlas';
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS qdrant_point_id TEXT;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS som_cluster TEXT;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS kmeans_cluster INTEGER;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS karpathy_blend DOUBLE PRECISION;

-- Enhanced indexes for atlas_packets
CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_gin ON atlas_packets USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_feature ON atlas_packets(source_ref, feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_group_id ON atlas_packets(group_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_qdrant_point_id ON atlas_packets(qdrant_point_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_som_cluster ON atlas_packets(som_cluster);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_kmeans_cluster ON atlas_packets(kmeans_cluster);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_file_path ON atlas_packets(file_path);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_universe ON atlas_packets(packet_universe);

-- Optional: JSONB path-specific indexes (if needed for frequent queries)
-- CREATE INDEX IF NOT EXISTS idx_atlas_packets_tags_gin ON atlas_packets USING gin((metadata->'tags'));
-- CREATE INDEX IF NOT EXISTS idx_atlas_packets_ontology_gin ON atlas_packets USING gin((metadata->'ontology'));
