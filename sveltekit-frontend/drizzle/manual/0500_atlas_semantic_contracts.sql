-- Phase 109: Semantic Contracts Infrastructure
-- Author: Semantic Contracts Team
-- Date: 2026-07-27
-- Description: Vector registry, model runs, domain predictions, ontology proposals, feature labels

-- ============================================================================
-- 1. Vector Registry (canonical vector identity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS atlas_vector_registry (
  vector_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity spine
  packet_key TEXT NOT NULL,
  vector_name TEXT NOT NULL CHECK (vector_name IN (
    'dense_384', 'dense_768_legacy', 'title_384', 'summary_384', 'symbol_384', 'ontology_384',
    'late_interaction', 'bm42_sparse'
  )),

  -- Model metadata
  model TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  representation TEXT NOT NULL CHECK (representation IN ('dense', 'sparse', 'multivector')),
  distance_metric TEXT NOT NULL CHECK (distance_metric IN ('Cosine', 'Dot', 'Euclid', 'Manhattan')),

  -- Properties
  normalized BOOLEAN NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  workspace_revision TEXT NOT NULL,

  -- Qdrant coupling (informational)
  qdrant_collection TEXT,
  qdrant_point_id TEXT,

  -- Artifact storage
  artifact_uri TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LEGACY', 'ARCHIVED')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(packet_key, vector_name, model_revision, content_sha256)
);

CREATE INDEX atlas_vector_registry_packet_idx ON atlas_vector_registry(packet_key, status);
CREATE INDEX atlas_vector_registry_model_idx ON atlas_vector_registry(vector_name, model_revision, dimensions);
CREATE INDEX atlas_vector_registry_revision_idx ON atlas_vector_registry(workspace_revision);

-- ============================================================================
-- 2. Model Runs (training, evaluation, inference)
-- ============================================================================
CREATE TABLE IF NOT EXISTS atlas_model_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Model identity
  model_kind TEXT NOT NULL CHECK (model_kind IN (
    'rule_baseline', 'word_frequency_prototype', 'naive_bayes', 'logistic_regression',
    'xgboost', 'pytorch_mlp'
  )),
  model_version TEXT NOT NULL,
  model_sha256 CHAR(64) NOT NULL,

  -- Feature schema version
  feature_schema_version TEXT NOT NULL,
  training_snapshot_sha256 CHAR(64) NOT NULL,
  ontology_version TEXT NOT NULL,

  -- Training state
  embedding_model_revision TEXT,
  class_order JSONB NOT NULL DEFAULT '{}',
  parameters JSONB NOT NULL DEFAULT '{}',

  -- Evaluation metrics
  metrics JSONB DEFAULT '{}',

  -- Artifact
  artifact_uri TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'TRAINING', 'COMPLETED', 'FAILED')),

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(run_id)
);

CREATE INDEX atlas_model_runs_kind_idx ON atlas_model_runs(model_kind, model_version);
CREATE INDEX atlas_model_runs_status_idx ON atlas_model_runs(status, completed_at DESC);

-- ============================================================================
-- 3. Domain Predictions (non-canonical, staged to ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS atlas_domain_predictions (
  prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Batch tracking
  run_id UUID NOT NULL REFERENCES atlas_model_runs(run_id) ON DELETE CASCADE,

  -- Packet identity
  packet_key TEXT NOT NULL,

  -- Prediction
  predicted_domain TEXT NOT NULL,
  raw_score DOUBLE PRECISION NOT NULL,
  score_margin DOUBLE PRECISION,
  calibrated_confidence DOUBLE PRECISION CHECK (calibrated_confidence IS NULL OR (calibrated_confidence >= 0 AND calibrated_confidence <= 1)),

  -- Model tracking
  model_kind TEXT NOT NULL,
  model_version TEXT NOT NULL,
  model_sha256 CHAR(64) NOT NULL,
  feature_schema_version TEXT NOT NULL,
  source_snapshot_sha256 CHAR(64) NOT NULL,
  workspace_revision TEXT NOT NULL,
  ontology_version TEXT NOT NULL,

  -- Supporting evidence
  supporting_features JSONB NOT NULL DEFAULT '{}',

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'PREDICTED' CHECK (status IN (
    'PREDICTED', 'GATED_LOW_CONFIDENCE', 'GATED_VERSION_MISMATCH', 'GATED_UNKNOWN',
    'ACCEPTED', 'REJECTED', 'SUPERSEDED'
  )),
  gate_reason TEXT,

  -- Authorization
  authorized_by TEXT,
  authorized_at TIMESTAMPTZ,
  promoted_to_canonical_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(run_id, packet_key)
);

CREATE INDEX atlas_domain_predictions_packet_idx ON atlas_domain_predictions(packet_key, status);
CREATE INDEX atlas_domain_predictions_run_idx ON atlas_domain_predictions(run_id, status);
CREATE INDEX atlas_domain_predictions_created_idx ON atlas_domain_predictions(created_at DESC);

-- ============================================================================
-- 4. Ontology Relation Proposals (evidence-backed, non-canonical)
-- ============================================================================
CREATE TABLE IF NOT EXISTS atlas_ontology_relation_proposals (
  proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relation identity
  subject_packet_key TEXT NOT NULL,
  predicate TEXT NOT NULL CHECK (predicate IN (
    'BELONGS_TO_DOMAIN', 'IMPORTS_FROM', 'DEPENDS_ON', 'USES', 'DEFINES', 'EXTENDS',
    'IMPLEMENTS', 'REFERENCES', 'TESTS', 'DOCUMENTS', 'SIMILAR_DOMAIN', 'PRECEDES',
    'SUPERSEDES', 'RELATED_TO'
  )),
  object_packet_key TEXT NOT NULL,

  -- Evidence
  confidence DOUBLE PRECISION CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence_ids UUID ARRAY DEFAULT '{}'::UUID[],
  proposal_source TEXT DEFAULT 'other',

  -- Provenance
  proposed_by TEXT NOT NULL,
  ontology_version TEXT NOT NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN (
    'PROPOSED', 'GATED_LOW_CONFIDENCE', 'GATED_VERSION_MISMATCH',
    'GATED_SUBJECT_UNRESOLVED', 'GATED_OBJECT_UNRESOLVED',
    'ACCEPTED', 'REJECTED', 'APPROVED', 'DEPRECATED'
  )),
  gate_reason TEXT,

  -- Authorization
  approved_by TEXT,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(subject_packet_key, predicate, object_packet_key)
);

CREATE INDEX atlas_ontology_proposals_subject_idx ON atlas_ontology_relation_proposals(subject_packet_key, status);
CREATE INDEX atlas_ontology_proposals_object_idx ON atlas_ontology_relation_proposals(object_packet_key, status);
CREATE INDEX atlas_ontology_proposals_created_idx ON atlas_ontology_relation_proposals(created_at DESC);

-- ============================================================================
-- 5. Feature Label Proposals (for unseen domains or uncertain labels)
-- ============================================================================
CREATE TABLE IF NOT EXISTS atlas_feature_label_proposals (
  proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Packet identity
  feature_id TEXT NOT NULL,
  packet_key TEXT NOT NULL,

  -- Proposed label
  proposed_label TEXT NOT NULL,
  label_kind TEXT NOT NULL CHECK (label_kind IN ('domain', 'tag', 'category', 'other')),

  -- Evidence
  evidence_ids UUID ARRAY DEFAULT '{}'::UUID[],

  -- Provenance
  proposed_by TEXT NOT NULL,
  score DOUBLE PRECISION,
  ontology_version TEXT NOT NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'ACCEPTED', 'REJECTED')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(feature_id, packet_key, proposed_label)
);

CREATE INDEX atlas_feature_label_proposals_packet_idx ON atlas_feature_label_proposals(packet_key, status);
CREATE INDEX atlas_feature_label_proposals_feature_idx ON atlas_feature_label_proposals(feature_id, status);

-- ============================================================================
-- 6. Model Run Metadata Table (classification runs summary)
-- ============================================================================
CREATE TABLE IF NOT EXISTS atlas_domain_classification_runs (
  classification_run_id UUID PRIMARY KEY,
  classifier_kind TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  model_sha256 CHAR(64) NOT NULL,
  vocabulary_size INTEGER,
  vocabulary_hash CHAR(64),
  laplace_alpha DOUBLE PRECISION,
  training_rows INTEGER NOT NULL,
  validation_rows INTEGER NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL,
  macro_f1 DOUBLE PRECISION NOT NULL,
  weighted_f1 DOUBLE PRECISION NOT NULL,
  macro_precision DOUBLE PRECISION NOT NULL,
  macro_recall DOUBLE PRECISION NOT NULL,
  abstained_count INTEGER NOT NULL,
  abstention_rate DOUBLE PRECISION NOT NULL,
  confidence_threshold DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(classification_run_id)
);

CREATE INDEX atlas_domain_classification_runs_kind_idx ON atlas_domain_classification_runs(classifier_kind);
CREATE INDEX atlas_domain_classification_runs_created_idx ON atlas_domain_classification_runs(created_at DESC);
