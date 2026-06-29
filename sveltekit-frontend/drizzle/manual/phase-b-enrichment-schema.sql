-- Phase B: Multi-Pass Summary Enrichment Schema
-- Created: 2026-06-29
-- Purpose: Add columns and tables for entities, classification, relationships, and BM25 indexing

-- ===================================================================
-- PASS 2: Entity Extraction & Keywords (LangExtract integration)
-- ===================================================================

ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS extracted_entities jsonb DEFAULT '[]'::jsonb;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}'::text[];
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS error_pattern varchar(255);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_extracted_entities ON atlas_packets USING GIN (extracted_entities);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_keywords ON atlas_packets USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_error_pattern ON atlas_packets (error_pattern);

-- ===================================================================
-- PASS 3: Domain Classification (Gemma4 ontology classification)
-- ===================================================================

ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS feature_group_id varchar(255);
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS domain_class varchar(255);
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS taxonomy_level integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_group_id ON atlas_packets (feature_group_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_domain_class ON atlas_packets (domain_class);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_taxonomy_level ON atlas_packets (taxonomy_level);

-- ===================================================================
-- PASS 4: Feature Relationships & Graph Building
-- ===================================================================

CREATE TABLE IF NOT EXISTS atlas_feature_relationships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_feature_id varchar(255) NOT NULL,
  target_feature_id varchar(255) NOT NULL,
  relationship_type varchar(50) NOT NULL, -- parent, sibling, child, related_by_domain, related_by_error, similar_summary
  strength real DEFAULT 0.5, -- 0.0-1.0 confidence
  reasoning text, -- Why this relationship was inferred
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_relationship UNIQUE (source_feature_id, target_feature_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_feature_relationships_source ON atlas_feature_relationships (source_feature_id);
CREATE INDEX IF NOT EXISTS idx_feature_relationships_target ON atlas_feature_relationships (target_feature_id);
CREATE INDEX IF NOT EXISTS idx_feature_relationships_type ON atlas_feature_relationships (relationship_type);
CREATE INDEX IF NOT EXISTS idx_feature_relationships_strength ON atlas_feature_relationships (strength DESC);

-- ===================================================================
-- PASS 5: Domain Ontology (taxonomy hierarchy)
-- ===================================================================

CREATE TABLE IF NOT EXISTS atlas_domain_ontology (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id varchar(255) UNIQUE NOT NULL,
  group_label varchar(255) NOT NULL,
  parent_group_id varchar(255),
  description text,
  taxonomy_level integer DEFAULT 0,
  confidence real DEFAULT 1.0,
  examples text[], -- Example features in this group
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_ontology_group_id ON atlas_domain_ontology (group_id);
CREATE INDEX IF NOT EXISTS idx_domain_ontology_parent ON atlas_domain_ontology (parent_group_id);
CREATE INDEX IF NOT EXISTS idx_domain_ontology_level ON atlas_domain_ontology (taxonomy_level);

-- ===================================================================
-- PASS 5: BM25 Full-Text Index Metadata
-- ===================================================================

ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS bm25_indexed_at timestamp with time zone;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS bm25_score real;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS bm25_terms text[];

CREATE INDEX IF NOT EXISTS idx_atlas_packets_bm25_indexed_at ON atlas_packets (bm25_indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_bm25_terms ON atlas_packets USING GIN (bm25_terms);

-- ===================================================================
-- Multi-Pass Processing Tracking
-- ===================================================================

CREATE TABLE IF NOT EXISTS atlas_enrichment_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pass_number integer NOT NULL, -- 2, 3, 4, 5
  pass_name varchar(100) NOT NULL, -- entity_extraction, classification, relationships, bm25_indexing
  total_packets integer,
  processed_packets integer DEFAULT 0,
  failed_packets integer DEFAULT 0,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  duration_minutes real,
  status varchar(50) DEFAULT 'in_progress', -- in_progress, completed, failed
  notes text,
  CONSTRAINT unique_pass_run UNIQUE (pass_number, started_at)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_progress_pass ON atlas_enrichment_progress (pass_number, status);
CREATE INDEX IF NOT EXISTS idx_enrichment_progress_started ON atlas_enrichment_progress (started_at DESC);

-- ===================================================================
-- Sample Domain Ontology Seeding (DevOps example)
-- ===================================================================

INSERT INTO atlas_domain_ontology (group_id, group_label, parent_group_id, description, taxonomy_level, examples)
VALUES
  ('devops', 'DevOps & Infrastructure', NULL, 'Deployment, monitoring, and operational tasks', 0,
   ARRAY['docker-compose', 'CI/CD', 'Kubernetes', 'monitoring', 'alerting']),
  ('devops.env-config', 'Environment Configuration', 'devops', 'Configuration management and environment setup', 1,
   ARRAY['.env files', 'docker compose', 'config loading', 'secrets']),
  ('devops.process-mgmt', 'Process Management', 'devops', 'Running, monitoring, and orchestrating processes', 1,
   ARRAY['PM2', 'forever', 'systemd', 'process groups']),
  ('error-handling', 'Error Handling & Recovery', NULL, 'Error detection, logging, and recovery strategies', 0,
   ARRAY['try-catch', 'error boundaries', 'fallbacks', 'retries']),
  ('auth', 'Authentication & Authorization', NULL, 'User authentication, sessions, and permissions', 0,
   ARRAY['Lucia auth', 'JWT', 'sessions', 'RBAC']),
  ('retrieval', 'Information Retrieval', NULL, 'Search, indexing, and retrieval strategies', 0,
   ARRAY['Qdrant', 'BM25', 'vector search', 'full-text search']),
  ('api', 'API Design & Integration', NULL, 'REST, gRPC, and service communication', 0,
   ARRAY['HTTP routes', 'gRPC', 'OpenAPI', 'webhooks'])
ON CONFLICT (group_id) DO NOTHING;

-- ===================================================================
-- Audit Views for Phase B Progress
-- ===================================================================

CREATE VIEW IF NOT EXISTS v_phase_b_progress AS
SELECT
  'Pass 2: Entity Extraction' as pass_name,
  COUNT(*) as total_packets,
  COUNT(CASE WHEN extracted_entities != '[]'::jsonb THEN 1 END) as processed,
  ROUND(100.0 * COUNT(CASE WHEN extracted_entities != '[]'::jsonb THEN 1 END) / COUNT(*), 2) as pct_complete
FROM atlas_packets
UNION ALL
SELECT
  'Pass 3: Domain Classification',
  COUNT(*),
  COUNT(CASE WHEN feature_group_id IS NOT NULL THEN 1 END),
  ROUND(100.0 * COUNT(CASE WHEN feature_group_id IS NOT NULL THEN 1 END) / COUNT(*), 2)
FROM atlas_packets
UNION ALL
SELECT
  'Pass 4: Relationships',
  (SELECT COUNT(DISTINCT source_feature_id) FROM atlas_feature_relationships),
  (SELECT COUNT(*) FROM atlas_feature_relationships),
  0.0
FROM atlas_packets
LIMIT 1
UNION ALL
SELECT
  'Pass 5: BM25 Indexing',
  COUNT(*),
  COUNT(CASE WHEN bm25_indexed_at IS NOT NULL THEN 1 END),
  ROUND(100.0 * COUNT(CASE WHEN bm25_indexed_at IS NOT NULL THEN 1 END) / COUNT(*), 2)
FROM atlas_packets;

-- ===================================================================
-- Verification: Show current state
-- ===================================================================

SELECT 'atlas_packets enrichment columns' as check_name,
  CASE
    WHEN COUNT(*) >= 6 THEN '✅ PASS - All columns exist'
    ELSE '⏳ PENDING - ' || COUNT(*) || '/6 columns'
  END as status
FROM (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'atlas_packets' AND column_name IN (
    'extracted_entities', 'keywords', 'error_pattern',
    'feature_group_id', 'domain_class', 'taxonomy_level'
  )
) t;

SELECT 'atlas_feature_relationships table' as check_name,
  CASE
    WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'atlas_feature_relationships')
    THEN '✅ PASS - Table created'
    ELSE '⏳ PENDING'
  END as status;

SELECT 'atlas_domain_ontology table' as check_name,
  CASE
    WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'atlas_domain_ontology')
    THEN '✅ PASS - Table created'
    ELSE '⏳ PENDING'
  END as status;
