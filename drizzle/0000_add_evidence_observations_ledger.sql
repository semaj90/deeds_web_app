
-- Migration for the new Observation Ledger
-- This table records every single agent output run, regardless of whether it
-- contributes to the canonical state. It is immutable/append-only for provenance.

CREATE TABLE IF NOT EXISTS atlas_evidence_observations (
    observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    packet_key text NOT NULL,
    feature_id text NOT NULL,
    tree_node_id text,
    lane text NOT NULL,
    producer text NOT NULL,
    producer_version text NOT NULL,
    run_id uuid NOT NULL,
    subject_kind text NOT NULL,
    subject_id text NOT NULL,
    predicate text NOT NULL,
    object_kind text NOT NULL,
    object_id text NOT NULL,
    score double precision,
    confidence double precision,
    source_content_sha256 char(64) NOT NULL,
    workspace_revision text NOT NULL,
    evidence jsonb NOT NULL,
    evidence_state text NOT NULL,
    observed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexing for quick lookup by source, feature, or time
CREATE INDEX idx_obs_source_ref ON atlas_evidence_observations (source_content_sha256);
CREATE INDEX idx_obs_feature_id ON atlas_evidence_observations (feature_id);
CREATE INDEX idx_obs_observed_at ON atlas_evidence_observations (observed_at);


-- End of migration content

-- Added initial comments for review
