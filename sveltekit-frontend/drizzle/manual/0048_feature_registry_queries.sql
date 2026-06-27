-- Feature Registry Queries Audit Table (Phase 2.5)
-- Tracks feature registry searches, token savings recommendations, and audit trail

CREATE TABLE IF NOT EXISTS feature_registry_queries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,

  -- Query metadata
  query_hash varchar(64) NOT NULL,
  query_text text NOT NULL,
  query_type varchar(50) NOT NULL DEFAULT 'feature_search',

  -- Search results
  feature_candidates_count integer NOT NULL DEFAULT 0,
  similarity_scores real[] NOT NULL DEFAULT '{}',
  best_route varchar(100),
  recommended_routes text[],

  -- Token analysis
  baseline_tokens integer NOT NULL DEFAULT 0,
  estimated_total_tokens integer NOT NULL DEFAULT 0,
  estimated_saved_tokens integer NOT NULL DEFAULT 0,
  savings_percentage real NOT NULL DEFAULT 0.0,
  cache_key_suggestion varchar(256),

  -- Audit metadata
  user_id integer,
  trace_id varchar(100),
  operation varchar(50),

  -- Timing
  search_latency_ms integer NOT NULL DEFAULT 0,
  bitfrost_hit boolean NOT NULL DEFAULT false,
  postgres_hit boolean NOT NULL DEFAULT false,
  qdrant_hit boolean NOT NULL DEFAULT false,

  -- Storage
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,

  -- Relationships
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS feature_registry_queries_query_hash_idx
  ON feature_registry_queries(query_hash);
CREATE INDEX IF NOT EXISTS feature_registry_queries_user_id_idx
  ON feature_registry_queries(user_id);
CREATE INDEX IF NOT EXISTS feature_registry_queries_trace_id_idx
  ON feature_registry_queries(trace_id);
CREATE INDEX IF NOT EXISTS feature_registry_queries_created_at_idx
  ON feature_registry_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS feature_registry_queries_savings_idx
  ON feature_registry_queries(savings_percentage DESC);
