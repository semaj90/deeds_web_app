-- Packet Topology Projection Table
-- Canonical derived topology/domain/SOM/manifold layer
-- Bridges Postgres canonical packets to topology/search/ranking dimensions

CREATE TABLE IF NOT EXISTS packet_topology_projection (
  packet_key text PRIMARY KEY NOT NULL,
  feature_id text NOT NULL,
  source_ref text,
  domain text,

  -- Cluster identity
  cluster_key text,
  cluster_id integer,
  kmeans_cluster integer,
  som_cluster integer,

  -- SOM grid coordinates
  som_row integer,
  som_col integer,

  -- Community / topology labeling
  community_id text,
  topology_label text,
  ontology_label text,

  -- 4D manifold coordinates (searchable coordinate space)
  -- x = semantic similarity (0.0-1.0)
  -- y = graph/community position (0.0-1.0)
  -- z = time/recency/lifecycle depth (0.0-1.0)
  -- w = authority/confidence/rank (0.0-1.0)
  manifold_x double precision,
  manifold_y double precision,
  manifold_z double precision,
  manifold_w double precision,

  -- Mirror join status
  qdrant_point_id text,
  qdrant_joinable boolean DEFAULT false,
  redis_hot_key text,
  neo4j_node_key text,

  -- Metadata envelope
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- B-tree indexes for exact/range lookups
CREATE INDEX IF NOT EXISTS idx_ptp_feature_id
  ON packet_topology_projection (feature_id);

CREATE INDEX IF NOT EXISTS idx_ptp_domain
  ON packet_topology_projection (domain);

CREATE INDEX IF NOT EXISTS idx_ptp_cluster_id
  ON packet_topology_projection (cluster_id);

CREATE INDEX IF NOT EXISTS idx_ptp_som
  ON packet_topology_projection (som_row, som_col);

CREATE INDEX IF NOT EXISTS idx_ptp_community_id
  ON packet_topology_projection (community_id);

CREATE INDEX IF NOT EXISTS idx_ptp_qdrant_point
  ON packet_topology_projection (qdrant_point_id);

-- GIN index for JSONB metadata containment queries
CREATE INDEX IF NOT EXISTS idx_ptp_metadata_gin
  ON packet_topology_projection USING gin (metadata);

-- Orphan Points Table
-- Qdrant points that don't join to canonical Postgres spine
CREATE TABLE IF NOT EXISTS qdrant_orphan_points (
  point_id text PRIMARY KEY NOT NULL,
  reason text,
  payload jsonb DEFAULT '{}'::jsonb,
  candidate_packet_key text,
  candidate_feature_id text,
  resolved boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for orphan audit
CREATE INDEX IF NOT EXISTS idx_qop_resolved
  ON qdrant_orphan_points (resolved);

CREATE INDEX IF NOT EXISTS idx_qop_candidate_packet_key
  ON qdrant_orphan_points (candidate_packet_key);
