-- P1 Phase 2B: Topology Index Table
-- 4D routing space: x_cosine (Qdrant), y_graph (Neo4j), z_som (SOM), w_authority (Karpathy)
-- Created: June 15, 2026

CREATE TABLE IF NOT EXISTS atlas_topology_index (
  packet_key      VARCHAR(255) PRIMARY KEY,

  x_cosine        REAL,
  y_graph         INT,
  z_som           INT,
  w_authority     REAL,

  som_source      VARCHAR(50),
  karpathy_score  REAL,
  latent_64       BYTEA,

  community_id    BIGINT,
  tree_node_id    UUID,

  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (packet_key) REFERENCES atlas_codebase_packets(packet_key) ON DELETE CASCADE,
  FOREIGN KEY (tree_node_id) REFERENCES atlas_tree_nodes(node_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_topo_x ON atlas_topology_index(x_cosine);
CREATE INDEX IF NOT EXISTS idx_topo_y ON atlas_topology_index(y_graph);
CREATE INDEX IF NOT EXISTS idx_topo_z ON atlas_topology_index(z_som);
CREATE INDEX IF NOT EXISTS idx_topo_w ON atlas_topology_index(w_authority);
CREATE INDEX IF NOT EXISTS idx_topo_karpathy ON atlas_topology_index(karpathy_score DESC);
CREATE INDEX IF NOT EXISTS idx_topo_community ON atlas_topology_index(community_id);
CREATE INDEX IF NOT EXISTS idx_topo_tree_node ON atlas_topology_index(tree_node_id);
