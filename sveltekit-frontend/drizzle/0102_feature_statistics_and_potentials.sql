-- Phase 102: Feature Statistics + Potentials Layer
-- Migration for unified retrieval stack
-- Date: 2026-07-02

-- Layer 2: Statistics (ephemeral computation results)
CREATE TABLE IF NOT EXISTS feature_statistics (
  feature_id TEXT PRIMARY KEY,
  pagerank REAL,
  hits_authority REAL,
  hits_hub REAL,
  community INTEGER,
  som_cluster INTEGER,
  som_cell_x INTEGER,
  som_cell_y INTEGER,
  cluster_degree INTEGER,
  in_degree INTEGER,
  out_degree INTEGER,
  betweenness REAL,
  freshness_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (feature_id) REFERENCES codebase_chunk_index(feature_id) ON DELETE CASCADE
);

CREATE INDEX idx_feature_statistics_pagerank ON feature_statistics(pagerank DESC);
CREATE INDEX idx_feature_statistics_community ON feature_statistics(community);
CREATE INDEX idx_feature_statistics_som_cluster ON feature_statistics(som_cluster);
CREATE INDEX idx_feature_statistics_som_cell ON feature_statistics(som_cell_x, som_cell_y);
CREATE INDEX idx_feature_statistics_freshness ON feature_statistics(freshness_days);

-- Layer 3: Potentials (soft routing for fallbacks and candidate discovery)
CREATE TABLE IF NOT EXISTS packet_potentials (
  packet_key TEXT NOT NULL,
  title_id TEXT NOT NULL,
  title_like JSONB DEFAULT '[]'::jsonb,              -- ["alias1", "alias2", ...]
  potential_scores JSONB DEFAULT '{}'::jsonb,       -- {lexical: 0.65, semantic: 0.72, topology: 0.48}
  route_hint TEXT,                                   -- 'canonical' | 'lexical_fallback' | 'deep_research' | 'external_candidate'
  source_ref TEXT,                                   -- Where this candidate came from
  source_type TEXT,                                  -- 'canonical' | 'firecrawl' | 'searxng' | 'local_deep'
  confidence REAL DEFAULT 0.0,                       -- 0.0-1.0, promotion threshold
  needs_human_review BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (packet_key, title_id)
);

CREATE INDEX idx_potentials_route_hint ON packet_potentials(route_hint);
CREATE INDEX idx_potentials_source_type ON packet_potentials(source_type);
CREATE INDEX idx_potentials_confidence ON packet_potentials(confidence DESC);
CREATE INDEX idx_potentials_packet_key ON packet_potentials(packet_key);
CREATE INDEX idx_potentials_created_at ON packet_potentials(created_at DESC);

-- Promotion log (audit trail for candidate → canonical transitions)
CREATE TABLE IF NOT EXISTS packet_promotion_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  packet_key TEXT NOT NULL,
  promoted_from TEXT,              -- 'firecrawl' | 'deep_research' | 'potentials'
  promoted_to TEXT,                -- 'codebase_chunk_index'
  confidence_before REAL,
  confidence_after REAL,
  validator_id TEXT,
  validation_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (packet_key) REFERENCES packet_potentials(packet_key) ON DELETE CASCADE
);

CREATE INDEX idx_promotion_log_packet_key ON packet_promotion_log(packet_key);
CREATE INDEX idx_promotion_log_promoted_from ON packet_promotion_log(promoted_from);
CREATE INDEX idx_promotion_log_created_at ON packet_promotion_log(created_at DESC);

-- Fallback routing audit (track which fallback paths are used)
CREATE TABLE IF NOT EXISTS fallback_routing_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query_text TEXT NOT NULL,
  query_embedding VECTOR(768),
  route_hint TEXT NOT NULL,
  source_type TEXT,
  candidate_count INTEGER,
  result_rank INTEGER,
  result_score REAL,
  user_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fallback_routing_route_hint ON fallback_routing_audit(route_hint);
CREATE INDEX idx_fallback_routing_created_at ON fallback_routing_audit(created_at DESC);
