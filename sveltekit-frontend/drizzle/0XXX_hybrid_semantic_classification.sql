-- Phase 2: Hybrid Semantic Classification Schema
-- Date: 2026-07-28
-- Description: Multi-label probabilistic domain classification with evidence tracking

-- Domain evidence table (stores classification results)
CREATE TABLE IF NOT EXISTS domain_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  entity_id UUID NOT NULL,

  -- Multi-label probabilistic output (stored as JSONB array)
  domains JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Array of { domain, score, source, explanation? }

  -- Aggregate metrics
  max_score REAL NOT NULL CHECK (max_score >= 0 AND max_score <= 1),
  aggregate_confidence REAL NOT NULL CHECK (aggregate_confidence >= 0 AND aggregate_confidence <= 1),
  source_count INTEGER NOT NULL CHECK (source_count >= 1 AND source_count <= 5),

  -- Provenance
  algorithm_version TEXT NOT NULL,  -- e.g., "hybrid-semantic:v1.0"
  workspace_revision TEXT NOT NULL,
  content_hash TEXT NOT NULL,       -- SHA256, 64 hex chars

  -- Evidence tracking (bitmask for fast predicates)
  evidence_flags BIGINT NOT NULL DEFAULT 0,

  -- Full evidence breakdown (do NOT bit-pack; store full details)
  evidence_details JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { lexical: [...], semantic: [...], graph: [...], external: [...] }

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Constraints
  UNIQUE(entity_id, workspace_revision)  -- One classification per entity per workspace revision
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_domain_evidence_entity_id ON domain_evidence(entity_id);
CREATE INDEX IF NOT EXISTS idx_domain_evidence_workspace ON domain_evidence(workspace_revision);
CREATE INDEX IF NOT EXISTS idx_domain_evidence_max_score ON domain_evidence(max_score DESC);
CREATE INDEX IF NOT EXISTS idx_domain_evidence_created_at ON domain_evidence(created_at DESC);

-- JSONB indexes for domain queries
CREATE INDEX IF NOT EXISTS idx_domain_evidence_domains_gin ON domain_evidence USING GIN (domains);
CREATE INDEX IF NOT EXISTS idx_domain_evidence_details_gin ON domain_evidence USING GIN (evidence_details);

-- Domain ontology table (configuration)
CREATE TABLE IF NOT EXISTS domain_ontology (
  domain TEXT PRIMARY KEY,

  label TEXT NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'core' CHECK (category IN ('core', 'infrastructure', 'optional', 'experimental')),
  authority REAL NOT NULL DEFAULT 0.5 CHECK (authority >= 0 AND authority <= 1),
  parent_domains JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Array of parent domain names

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Classification history (audit trail)
CREATE TABLE IF NOT EXISTS classification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to domain_evidence
  domain_evidence_id UUID NOT NULL REFERENCES domain_evidence(id) ON DELETE CASCADE,

  -- Previous version (if updating classification)
  previous_version JSONB,

  -- Change reason
  change_reason TEXT,
  algorithm_change BOOLEAN DEFAULT FALSE,

  -- Timestamp
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_classification_history_evidence ON classification_history(domain_evidence_id);
CREATE INDEX IF NOT EXISTS idx_classification_history_changed_at ON classification_history(changed_at DESC);

-- Validation gate results (track quality metrics per run)
CREATE TABLE IF NOT EXISTS classification_validation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Validation context
  run_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  algorithm_version TEXT NOT NULL,
  workspace_revision TEXT NOT NULL,

  -- Gate results (JSONB for flexibility)
  gate_results JSONB NOT NULL,  -- { G1: { passed: boolean, actual: number, threshold: number }, ... }

  -- Summary metrics
  total_entities INTEGER NOT NULL,
  classified_entities INTEGER NOT NULL,
  average_confidence REAL,
  average_source_count REAL,

  -- Overall status
  all_gates_passed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_validation_runs_timestamp ON classification_validation_runs(run_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_validation_runs_workspace ON classification_validation_runs(workspace_revision);
