CREATE TABLE IF NOT EXISTS rag_query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT NOT NULL UNIQUE,
  normalized_query TEXT NOT NULL,
  query_embedding_model TEXT,
  query_vector_id TEXT,
  entity_fingerprint TEXT,
  tag_fingerprint TEXT,
  centroid_cluster_id TEXT,
  answer TEXT,
  answer_json JSONB DEFAULT '{}',
  hit_count INT DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS rag_query_cache_centroid_idx
  ON rag_query_cache(centroid_cluster_id);
CREATE INDEX IF NOT EXISTS rag_query_cache_entity_idx
  ON rag_query_cache(entity_fingerprint);
CREATE INDEX IF NOT EXISTS rag_query_cache_tags_idx
  ON rag_query_cache(tag_fingerprint);


CREATE TABLE IF NOT EXISTS qdrant_centroid_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key TEXT NOT NULL UNIQUE,
  collection_name TEXT NOT NULL,
  label TEXT,
  summary TEXT,
  centroid_point_id TEXT,
  centroid_vector_hash TEXT,
  tags TEXT[] DEFAULT '{}',
  directory_paths TEXT[] DEFAULT '{}',
  member_count INT DEFAULT 0,
  avg_score DOUBLE PRECISION,
  page_rank DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qdrant_centroid_clusters_tags_gin
  ON qdrant_centroid_clusters USING GIN(tags);
CREATE INDEX IF NOT EXISTS qdrant_centroid_clusters_dirs_gin
  ON qdrant_centroid_clusters USING GIN(directory_paths);


CREATE TABLE IF NOT EXISTS qdrant_cluster_members (
  cluster_key TEXT NOT NULL,
  stable_key TEXT NOT NULL,
  qdrant_point_id TEXT NOT NULL,
  file_path TEXT,
  directory_path TEXT,
  membership_score DOUBLE PRECISION DEFAULT 1.0,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (cluster_key, stable_key)
);

CREATE INDEX IF NOT EXISTS qdrant_cluster_members_file_idx
  ON qdrant_cluster_members(file_path);
CREATE INDEX IF NOT EXISTS qdrant_cluster_members_dir_idx
  ON qdrant_cluster_members(directory_path);


CREATE TABLE IF NOT EXISTS llm_summary_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  summary_short TEXT,
  summary_long TEXT,
  json_summary JSONB DEFAULT '{}',
  embedding_model TEXT,
  qdrant_point_id TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_summary_cache_tags_gin
  ON llm_summary_cache USING GIN(tags);
CREATE INDEX IF NOT EXISTS llm_summary_cache_json_gin
  ON llm_summary_cache USING GIN(json_summary);


CREATE TABLE IF NOT EXISTS kag_dag_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  intent TEXT,
  status TEXT NOT NULL,
  model TEXT,
  total_duration_ms INT,
  final_answer TEXT,
  final_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);


CREATE TABLE IF NOT EXISTS kag_dag_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES kag_dag_runs(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL,
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  status TEXT NOT NULL,
  cache_hit BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  error JSONB DEFAULT '{}',
  UNIQUE(run_id, node_key)
);

CREATE INDEX IF NOT EXISTS kag_dag_nodes_run_idx
  ON kag_dag_nodes(run_id);
CREATE INDEX IF NOT EXISTS kag_dag_nodes_type_idx
  ON kag_dag_nodes(node_type);
CREATE INDEX IF NOT EXISTS kag_dag_nodes_cache_idx
  ON kag_dag_nodes(cache_hit);


CREATE TABLE IF NOT EXISTS kag_dag_edges (
  run_id UUID REFERENCES kag_dag_runs(id) ON DELETE CASCADE,
  from_node_key TEXT NOT NULL,
  to_node_key TEXT NOT NULL,
  edge_type TEXT DEFAULT 'depends_on',
  metadata JSONB DEFAULT '{}',
  PRIMARY KEY (run_id, from_node_key, to_node_key)
);
