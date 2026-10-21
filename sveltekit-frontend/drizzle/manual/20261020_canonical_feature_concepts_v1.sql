-- DRAFT — NOT APPLIED. Do not run against legal_ai_db without an explicit operator authorization.
--
-- Canonical feature concepts and the reviewed crosswalk from source-local feature definitions.
-- Additive only: creates two tables, indexes and a lifecycle trigger. Writes no rows.
--
-- Why this table exists (see .tmp/atlas/feature-identity-decision-receipt-v1.json):
--   * atlas_features is an AST-derived structural fact table, not a canonical concept registry.
--     This draft does not reuse it.
--   * atlas_feature_map feature_id values are source-local: 319 of 3,151 span several source refs,
--     and 225 are bare legacy names. Their meaning depends on the source namespace.
--   * Therefore: a canonical concept is minted only by review, and a source-local definition maps to
--     a canonical concept only through a reviewed crosswalk row. Nothing is inferred from a shared
--     local feature_id.
--
-- Layers:
--   canonical_feature_concepts        canonical_feature_id (global concept identity)
--   atlas_feature_crosswalk           (source_namespace, local_feature_id, crosswalk_revision) -> canonical_feature_id
--   atlas_feature_labels (other file) (feature_id, label_revision) -> versioned label;
--     feature_id references atlas_features, while concept_id remains a separate ontology link.
--   atlas_feature_map                 unchanged; still source-to-local mapping
--
-- Crosswalk lifecycle: PROPOSED -> REVIEWED, and REVIEWED -> WITHDRAWN as an explicit decision.
-- The current crosswalk for a local identity is the latest REVIEWED-or-WITHDRAWN decision, exactly
-- as for labels. A WITHDRAWN latest decision means no canonical mapping.

BEGIN;

-- 1. Canonical concepts: minted only by an approval, never by a writer that sees a shared local id.
CREATE TABLE IF NOT EXISTS canonical_feature_concepts (
  canonical_feature_id  text        PRIMARY KEY,
  concept_status        text        NOT NULL DEFAULT 'PROPOSED',
  minted_by             text,
  minted_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canonical_feature_concepts_id_nonblank CHECK (btrim(canonical_feature_id) <> ''),
  CONSTRAINT canonical_feature_concepts_status_valid CHECK (concept_status IN ('PROPOSED', 'APPROVED', 'RETIRED')),
  CONSTRAINT canonical_feature_concepts_approved_consistent CHECK (
    concept_status <> 'APPROVED' OR (minted_by IS NOT NULL AND minted_at IS NOT NULL)
  )
);

-- 2. Crosswalk: source-local definition -> canonical concept, versioned and reviewed.
CREATE TABLE IF NOT EXISTS atlas_feature_crosswalk (
  source_namespace      text        NOT NULL,
  local_feature_id      text        NOT NULL,
  crosswalk_revision    integer     NOT NULL DEFAULT 1,
  canonical_feature_id  text,
  crosswalk_status      text        NOT NULL DEFAULT 'PROPOSED',
  evidence_refs         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by           text,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_feature_crosswalk_pk PRIMARY KEY (source_namespace, local_feature_id, crosswalk_revision),
  CONSTRAINT atlas_feature_crosswalk_revision_positive CHECK (crosswalk_revision >= 1),
  CONSTRAINT atlas_feature_crosswalk_local_nonblank CHECK (btrim(local_feature_id) <> '' AND btrim(source_namespace) <> ''),
  CONSTRAINT atlas_feature_crosswalk_status_valid CHECK (crosswalk_status IN ('PROPOSED', 'REVIEWED', 'WITHDRAWN', 'SUPERSEDED')),
  CONSTRAINT atlas_feature_crosswalk_target_required CHECK (
    crosswalk_status NOT IN ('REVIEWED') OR canonical_feature_id IS NOT NULL
  ),
  CONSTRAINT atlas_feature_crosswalk_reviewed_consistent CHECK (
    crosswalk_status NOT IN ('REVIEWED', 'WITHDRAWN') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT atlas_feature_crosswalk_evidence_is_array CHECK (jsonb_typeof(evidence_refs) = 'array')
);

-- 3. Target must be an existing canonical concept (enforced here, guarded for replay).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'atlas_feature_crosswalk_target_fk'
  ) THEN
    ALTER TABLE atlas_feature_crosswalk
      ADD CONSTRAINT atlas_feature_crosswalk_target_fk
      FOREIGN KEY (canonical_feature_id) REFERENCES canonical_feature_concepts (canonical_feature_id) ON DELETE RESTRICT;
  END IF;
END
$$;

-- 4. Indexes for the lookups the crosswalk actually serves.
CREATE INDEX IF NOT EXISTS atlas_feature_crosswalk_current_idx
  ON atlas_feature_crosswalk (source_namespace, local_feature_id, crosswalk_revision DESC)
  WHERE crosswalk_status IN ('REVIEWED', 'WITHDRAWN');
CREATE INDEX IF NOT EXISTS atlas_feature_crosswalk_target_idx ON atlas_feature_crosswalk (canonical_feature_id);

-- 5. Current crosswalk: latest REVIEWED-or-WITHDRAWN decision per local identity, returned only if REVIEWED.
CREATE OR REPLACE VIEW atlas_feature_crosswalk_current AS
SELECT source_namespace, local_feature_id, crosswalk_revision, canonical_feature_id, reviewed_by, reviewed_at
FROM (
  SELECT DISTINCT ON (source_namespace, local_feature_id)
    source_namespace, local_feature_id, crosswalk_revision, canonical_feature_id, crosswalk_status,
    reviewed_by, reviewed_at
  FROM atlas_feature_crosswalk
  WHERE crosswalk_status IN ('REVIEWED', 'WITHDRAWN')
  ORDER BY source_namespace, local_feature_id, crosswalk_revision DESC
) latest_decision
WHERE latest_decision.crosswalk_status = 'REVIEWED';

-- 6. updated_at follows every change to both tables.
CREATE OR REPLACE FUNCTION atlas_feature_identity_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS canonical_feature_concepts_touch ON canonical_feature_concepts;
CREATE TRIGGER canonical_feature_concepts_touch
  BEFORE UPDATE ON canonical_feature_concepts
  FOR EACH ROW EXECUTE FUNCTION atlas_feature_identity_touch_updated_at();

DROP TRIGGER IF EXISTS atlas_feature_crosswalk_touch ON atlas_feature_crosswalk;
CREATE TRIGGER atlas_feature_crosswalk_touch
  BEFORE UPDATE ON atlas_feature_crosswalk
  FOR EACH ROW EXECUTE FUNCTION atlas_feature_identity_touch_updated_at();

-- 7. No rows are written here. Minting concepts and writing crosswalk rows are separate, authorized
--    operations with their own receipts. No identity is inferred from a shared local feature_id.

COMMIT;
-- SUPERSEDED UNAPPLIED DRAFT: use 20261021_feature_identity_v2.sql; do not introduce a second canonical concept registry.
