-- Phase 3 Step 7: Evidence Ledger Schema Migration
-- Date: 2026-07-27
-- Purpose: Immutable evidence observation ledgers for proof matrix validation
-- Tables: atlas_evidence_observations, atlas_observation_relationships,
--         atlas_packet_domain_memberships, atlas_mutation_proposals, atlas_human_feedback

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. atlas_evidence_observations
-- ═══════════════════════════════════════════════════════════════════════════
-- Immutable ledger of observations recorded across 5 evidence lanes.
-- Each observation independently verifies a fact without creating duplicates
-- when multiple agents report the same evidence.

CREATE TABLE IF NOT EXISTS atlas_evidence_observations (
  observation_id TEXT PRIMARY KEY NOT NULL,
  packet_key TEXT NOT NULL,
  observation_type VARCHAR(50) NOT NULL,
  evidence_lane VARCHAR(50) NOT NULL,
  value JSONB NOT NULL,
  confidence NUMERIC(3, 2) NOT NULL
    CHECK (confidence >= 0 AND confidence <= 1),
  source VARCHAR(50) NOT NULL,
  observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  CONSTRAINT fk_evidence_observations_packet
    FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key)
    ON DELETE RESTRICT,

  CONSTRAINT ck_observation_type
    CHECK (observation_type IN (
      'semantic_embedding', 'lexical_bm25', 'structural_ast',
      'domain_membership', 'identity_resolution', 'embedding_vector',
      'bm25_ranking', 'ast_distance'
    )),

  CONSTRAINT ck_evidence_lane
    CHECK (evidence_lane IN (
      'semantic_embedding_qdrant', 'lexical_bm25_search',
      'structural_ast_distance', 'domain_membership', 'identity_resolution'
    )),

  CONSTRAINT ck_source
    CHECK (source IN (
      'qdrant_dense_index', 'postgres_fts', 'tree_sitter_heuristic',
      'postgres_classification', 'postgres_canonical'
    ))
);

CREATE INDEX IF NOT EXISTS idx_evidence_observations_packet_type
  ON atlas_evidence_observations(packet_key, observation_type);

CREATE INDEX IF NOT EXISTS idx_evidence_observations_lane
  ON atlas_evidence_observations(evidence_lane);

CREATE INDEX IF NOT EXISTS idx_evidence_observations_observed_at
  ON atlas_evidence_observations(observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_observations_metadata_gin
  ON atlas_evidence_observations USING GIN(metadata);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. atlas_observation_relationships
-- ═══════════════════════════════════════════════════════════════════════════
-- Cross-observation relationships: corroboration, contradiction, refinement.
-- Enables multi-lane evidence fusion and conflict detection.

CREATE TABLE IF NOT EXISTS atlas_observation_relationships (
  id SERIAL PRIMARY KEY NOT NULL,
  source_obs_id TEXT NOT NULL,
  target_obs_id TEXT NOT NULL,
  relationship_type VARCHAR(50) NOT NULL,
  confidence NUMERIC(3, 2)
    CHECK (confidence >= 0 AND confidence <= 1),
  evidence_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  CONSTRAINT fk_obs_rel_source
    FOREIGN KEY (source_obs_id) REFERENCES atlas_evidence_observations(observation_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_obs_rel_target
    FOREIGN KEY (target_obs_id) REFERENCES atlas_evidence_observations(observation_id)
    ON DELETE CASCADE,

  CONSTRAINT ck_relationship_type
    CHECK (relationship_type IN (
      'corroborates', 'contradicts', 'refines', 'supersedes'
    )),

  CONSTRAINT ck_not_self_ref
    CHECK (source_obs_id != target_obs_id)
);

CREATE INDEX IF NOT EXISTS idx_observation_relationships_type
  ON atlas_observation_relationships(relationship_type);

CREATE INDEX IF NOT EXISTS idx_observation_relationships_created_at
  ON atlas_observation_relationships(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. atlas_packet_domain_memberships
-- ═══════════════════════════════════════════════════════════════════════════
-- Timestamped log of domain assignments. Multi-domain soft membership with
-- per-observation probability scores. Enables domain history tracking.

CREATE TABLE IF NOT EXISTS atlas_packet_domain_memberships (
  id SERIAL PRIMARY KEY NOT NULL,
  packet_key TEXT NOT NULL,
  domain_class VARCHAR(100) NOT NULL,
  probability NUMERIC(3, 2) NOT NULL
    CHECK (probability >= 0 AND probability <= 1),
  observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  source VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  CONSTRAINT fk_packet_domains_packet
    FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key)
    ON DELETE CASCADE,

  CONSTRAINT ck_source_type
    CHECK (source IN (
      'feature_extraction', 'manual', 'classification', 'agent_labeled'
    )),

  CONSTRAINT uq_packet_domain_observed
    UNIQUE (packet_key, domain_class, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_packet_domains_domain_class
  ON atlas_packet_domain_memberships(domain_class);

CREATE INDEX IF NOT EXISTS idx_packet_domains_probability_desc
  ON atlas_packet_domain_memberships(probability DESC);

CREATE INDEX IF NOT EXISTS idx_packet_domains_observed_at
  ON atlas_packet_domain_memberships(observed_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. atlas_mutation_proposals
-- ═══════════════════════════════════════════════════════════════════════════
-- Immutable audit trail of proposed mutations with state machine enforcement.
-- No mutation modifies canonical truth until approved + applied.

CREATE TABLE IF NOT EXISTS atlas_mutation_proposals (
  proposal_id TEXT PRIMARY KEY NOT NULL,
  packet_key TEXT NOT NULL,
  mutation_type VARCHAR(50) NOT NULL,
  changes JSONB NOT NULL,
  justification TEXT NOT NULL,
  observations_supporting TEXT[] NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by TEXT,
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_by TEXT,
  metadata JSONB,

  CONSTRAINT fk_mutations_packet
    FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key)
    ON DELETE RESTRICT,

  CONSTRAINT ck_mutation_type
    CHECK (mutation_type IN (
      'domain_membership_update', 'feature_id_correction',
      'source_ref_normalization', 'ontology_version_update',
      'tree_node_id_assignment', 'identity_merge'
    )),

  CONSTRAINT ck_status
    CHECK (status IN (
      'proposed', 'under_review', 'approved', 'applied', 'rejected'
    )),

  CONSTRAINT ck_applied_requires_timestamp_and_by
    CHECK (
      (status NOT IN ('applied', 'rejected') OR applied_at IS NOT NULL)
      AND (status != 'applied' OR applied_by IS NOT NULL)
    ),

  CONSTRAINT ck_temporal_consistency
    CHECK (applied_at IS NULL OR applied_at >= created_at),

  CONSTRAINT ck_observations_not_empty
    CHECK (array_length(observations_supporting, 1) > 0)
);

CREATE INDEX IF NOT EXISTS idx_mutations_packet_status
  ON atlas_mutation_proposals(packet_key, status);

CREATE INDEX IF NOT EXISTS idx_mutations_created_at_desc
  ON atlas_mutation_proposals(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mutations_status
  ON atlas_mutation_proposals(status);

CREATE INDEX IF NOT EXISTS idx_mutations_applied_at
  ON atlas_mutation_proposals(applied_at) WHERE applied_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. atlas_human_feedback
-- ═══════════════════════════════════════════════════════════════════════════
-- Human verification and feedback loop. Links domain experts to mutations
-- they approve. Non-blocking audit trail (approved flag tracks consensus).

CREATE TABLE IF NOT EXISTS atlas_human_feedback (
  id SERIAL PRIMARY KEY NOT NULL,
  packet_key TEXT NOT NULL,
  feedback_type VARCHAR(50) NOT NULL,
  feedback_text TEXT NOT NULL,
  reviewer_id TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  approved BOOLEAN DEFAULT FALSE NOT NULL,
  corresponding_proposal_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  CONSTRAINT fk_feedback_packet
    FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key)
    ON DELETE CASCADE,

  CONSTRAINT fk_feedback_proposal
    FOREIGN KEY (corresponding_proposal_id) REFERENCES atlas_mutation_proposals(proposal_id)
    ON DELETE SET NULL,

  CONSTRAINT ck_feedback_type
    CHECK (feedback_type IN (
      'domain_correction', 'feature_label_fix', 'identity_fix',
      'observation_quality', 'general_note'
    ))
);

CREATE INDEX IF NOT EXISTS idx_human_feedback_type
  ON atlas_human_feedback(feedback_type);

CREATE INDEX IF NOT EXISTS idx_human_feedback_approved_created
  ON atlas_human_feedback(approved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_human_feedback_packet
  ON atlas_human_feedback(packet_key);

CREATE INDEX IF NOT EXISTS idx_human_feedback_proposal
  ON atlas_human_feedback(corresponding_proposal_id)
  WHERE corresponding_proposal_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Helper Views (Optional, for convenience)
-- ═══════════════════════════════════════════════════════════════════════════

-- Summary view: packet identity + latest domain membership
CREATE OR REPLACE VIEW v_packet_latest_domains AS
SELECT
  ap.packet_key,
  ap.source_ref,
  ap.feature_id,
  json_object_agg(
    apdm.domain_class,
    apdm.probability ORDER BY apdm.domain_class
  ) AS domain_probabilities,
  max(apdm.observed_at) AS last_domain_update
FROM atlas_packets ap
LEFT JOIN atlas_packet_domain_memberships apdm
  ON ap.packet_key = apdm.packet_key
GROUP BY ap.packet_key, ap.source_ref, ap.feature_id;

-- Summary view: pending mutations awaiting approval
CREATE OR REPLACE VIEW v_mutations_pending_approval AS
SELECT
  amp.proposal_id,
  amp.packet_key,
  amp.mutation_type,
  amp.status,
  array_length(amp.observations_supporting, 1) AS observation_count,
  age(NOW(), amp.created_at) AS time_since_proposed,
  amp.created_by,
  ahf.approved AS human_approved
FROM atlas_mutation_proposals amp
LEFT JOIN atlas_human_feedback ahf
  ON amp.proposal_id = ahf.corresponding_proposal_id
WHERE amp.status IN ('proposed', 'under_review')
ORDER BY amp.created_at DESC;

-- Summary view: evidence lane coverage per packet
CREATE OR REPLACE VIEW v_packet_evidence_coverage AS
SELECT
  aeo.packet_key,
  count(DISTINCT aeo.evidence_lane) AS lanes_present,
  array_agg(DISTINCT aeo.evidence_lane ORDER BY aeo.evidence_lane) AS lanes,
  count(*) AS total_observations,
  avg(aeo.confidence) AS avg_confidence,
  min(aeo.observed_at) AS earliest_observation,
  max(aeo.observed_at) AS latest_observation
FROM atlas_evidence_observations aeo
GROUP BY aeo.packet_key;
