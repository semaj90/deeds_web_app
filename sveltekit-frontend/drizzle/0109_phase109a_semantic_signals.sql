-- Phase 109A: Semantic Signal and Domain Routing Schema
-- Timestamp: 2026-07-29T00:00:00Z
-- Description: Create 4 core tables for semantic signal routing, domain classification, and recommendation lifecycle

-- ===== ENUMS =====

DO $$ BEGIN
  CREATE TYPE signal_type AS ENUM (
    'DOMAIN_CLASS',
    'INTENT_TAG',
    'RETRIEVAL_LANE',
    'GRAPH_FACT',
    'CLASSIFICATION',
    'RECOMMENDATION',
    'LEARNED_POS',
    'LEARNED_ENTITY',
    'AST_SYMBOL',
    'EVIDENCE_REFERENCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE classification_status AS ENUM (
    'PENDING',
    'CLASSIFYING',
    'COMPLETE',
    'CONFLICT_DETECTED',
    'FAILED',
    'DEFERRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recommendation_status AS ENUM (
    'PROPOSED',
    'EVIDENCE_GATHERING',
    'READY_FOR_REVIEW',
    'APPROVED',
    'IMPLEMENTED',
    'VALIDATED',
    'REJECTED',
    'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== TABLES =====

-- semantic_signals: Core signal identity + provenance
CREATE TABLE IF NOT EXISTS semantic_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(255) NOT NULL,
  revision_id VARCHAR(255) NOT NULL,

  -- Identity
  subject_id VARCHAR(255) NOT NULL,
  signal_type signal_type NOT NULL,

  -- Provenance
  producer VARCHAR(255) NOT NULL,
  producer_model_revision VARCHAR(255),
  producer_schema_version VARCHAR(255),

  -- Evidence
  evidence_ids TEXT[] NOT NULL DEFAULT '{}',
  evidence_confidence REAL,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255),

  CONSTRAINT semantic_signals_evidence_confidence_range
    CHECK (evidence_confidence IS NULL OR (evidence_confidence >= 0.0 AND evidence_confidence <= 1.0))
);

CREATE INDEX IF NOT EXISTS idx_semantic_signals_workspace_revision
  ON semantic_signals (workspace_id, revision_id);
CREATE INDEX IF NOT EXISTS idx_semantic_signals_subject_type
  ON semantic_signals (subject_id, signal_type);
CREATE INDEX IF NOT EXISTS idx_semantic_signals_producer
  ON semantic_signals (producer);
CREATE INDEX IF NOT EXISTS idx_semantic_signals_evidence_ids
  ON semantic_signals USING GIN (evidence_ids);

-- domain_taxonomy_v1: Versioned domain label registry
CREATE TABLE IF NOT EXISTS domain_taxonomy_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(255) NOT NULL,
  domain_id VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  parent_domain_id VARCHAR(255),

  deprecated_at TIMESTAMP WITH TIME ZONE,
  deprecation_reason TEXT,
  replaced_by VARCHAR(255),

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE (domain_id, version)
);

CREATE INDEX IF NOT EXISTS idx_domain_taxonomy_domain_id ON domain_taxonomy_v1 (domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_taxonomy_active ON domain_taxonomy_v1 (is_active);
CREATE INDEX IF NOT EXISTS idx_domain_taxonomy_label ON domain_taxonomy_v1 (label);

-- classification_envelope: Signal versioning + classification state
CREATE TABLE IF NOT EXISTS classification_envelope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL,
  subject_id VARCHAR(255) NOT NULL,
  workspace_id VARCHAR(255) NOT NULL,

  status classification_status NOT NULL DEFAULT 'PENDING',
  version INTEGER NOT NULL DEFAULT 1,

  domain_labels JSONB,
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_details JSONB,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255),
  validated_at TIMESTAMP WITH TIME ZONE,
  validated_by VARCHAR(255),
  failure_reason TEXT,

  CONSTRAINT fk_classification_envelope_signal_id
    FOREIGN KEY (signal_id) REFERENCES semantic_signals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classification_envelope_signal_status
  ON classification_envelope (signal_id, status);
CREATE INDEX IF NOT EXISTS idx_classification_envelope_subject_workspace
  ON classification_envelope (subject_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_classification_envelope_conflict
  ON classification_envelope (conflict_flag);

-- recommendation_log: Evidence-backed recommendation lifecycle
CREATE TABLE IF NOT EXISTS recommendation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(255) NOT NULL,
  revision_id VARCHAR(255) NOT NULL,
  subject_id VARCHAR(255) NOT NULL,

  proposed_action TEXT NOT NULL,
  inference_explanation TEXT NOT NULL,

  evidence_ids TEXT[] NOT NULL DEFAULT '{}',
  evidence_confidence REAL NOT NULL DEFAULT 0.5,

  validation_criteria TEXT NOT NULL,
  expected_impact TEXT NOT NULL,

  rollback_plan TEXT NOT NULL,
  rollback_verification TEXT NOT NULL,

  status recommendation_status NOT NULL DEFAULT 'PROPOSED',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL,

  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by VARCHAR(255),

  implemented_at TIMESTAMP WITH TIME ZONE,
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_error TEXT,

  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT recommendation_log_evidence_confidence_range
    CHECK (evidence_confidence >= 0.0 AND evidence_confidence <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_log_subject_workspace
  ON recommendation_log (subject_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_status
  ON recommendation_log (status);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_evidence
  ON recommendation_log USING GIN (evidence_ids);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_created_by
  ON recommendation_log (created_by);
