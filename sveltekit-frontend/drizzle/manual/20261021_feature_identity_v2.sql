-- DRAFT — NOT APPLIED. Do not run against legal_ai_db without an explicit operator authorization.
-- Supersedes the unapplied 20261020_canonical_feature_concepts_v1.sql (names and ownership changed).
--
-- Ownership (preserved, not reused as a canonical registry):
--   atlas_features           AST-derived structural facts (existing; untouched)
--   atlas_fi_features        product-feature candidates (existing; untouched)
--   atlas_feature_map        source-to-local feature mapping (existing; untouched)
--
-- New tables (additive):
--   atlas_feature_concepts               canonical concept identity and lifecycle (immutable identity)
--   atlas_feature_source_identities      namespace-qualified source-local identity (no revision inside)
--   atlas_feature_concept_crosswalk      reviewed, revisioned mapping: source identity -> concept, with evidence
--   atlas_feature_labels                 versioned labels referencing atlas_feature_concepts
--
-- Independent state machines (none derives from another):
--   concept_status      PROPOSED | APPROVED | RETIRED
--   crosswalk_status    PROPOSED | REVIEWED | WITHDRAWN | SUPERSEDED
--   label_status        PROPOSED | REVIEWED | WITHDRAWN | SUPERSEDED
--
-- Rules enforced here:
--   * Identical local strings in different namespaces are different identities (PK includes namespace).
--   * One source identity may appear in many files: occurrences keep source_ref and revisions outside the identity.
--   * Two source identities may map to one concept: the crosswalk is many-to-one by design.
--   * A PROPOSED crosswalk never affects the current mapping; only REVIEWED does.
--   * The current mapping is the latest REVIEWED-or-WITHDRAWN decision; WITHDRAWN suppresses it.
--   * Reviewed decisions require reviewer and review time; REVIEWED requires a concept target.
--   * Evidence is a JSON array of source-qualified references, each carrying source_ref and source_revision.
--
-- Idempotent: guarded CREATE / DO blocks. Rollback: 20261021_feature_identity_v2.rollback.sql (not executed).

BEGIN;

-- 1. Canonical concept identity. Minted only by an approval, never seeded from candidates or legacy IDs.
CREATE TABLE IF NOT EXISTS atlas_feature_concepts (
  canonical_feature_id  text        PRIMARY KEY,
  concept_status        text        NOT NULL DEFAULT 'PROPOSED',
  minted_by             text,
  minted_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_feature_concepts_id_nonblank CHECK (btrim(canonical_feature_id) <> ''),
  CONSTRAINT atlas_feature_concepts_status_valid CHECK (concept_status IN ('PROPOSED', 'APPROVED', 'RETIRED')),
  CONSTRAINT atlas_feature_concepts_approved_consistent CHECK (
    concept_status <> 'APPROVED' OR (minted_by IS NOT NULL AND minted_at IS NOT NULL)
  )
);

-- 2. Source-local identity: stable across revisions. Namespace-qualified. No revision in the key.
CREATE TABLE IF NOT EXISTS atlas_feature_source_identities (
  source_namespace   text        NOT NULL,
  local_feature_id   text        NOT NULL,
  identity_status    text        NOT NULL DEFAULT 'OBSERVED',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_feature_source_identities_pk PRIMARY KEY (source_namespace, local_feature_id),
  CONSTRAINT atlas_feature_source_identities_nonblank CHECK (btrim(source_namespace) <> '' AND btrim(local_feature_id) <> ''),
  CONSTRAINT atlas_feature_source_identities_status_valid CHECK (identity_status IN ('OBSERVED', 'UNRESOLVED_LEGACY'))
);

-- 3. Reviewed, revisioned crosswalk from a source identity to a canonical concept.
CREATE TABLE IF NOT EXISTS atlas_feature_concept_crosswalk (
  source_namespace      text        NOT NULL,
  local_feature_id      text        NOT NULL,
  crosswalk_revision    integer     NOT NULL DEFAULT 1,
  canonical_feature_id  text,
  crosswalk_status      text        NOT NULL DEFAULT 'PROPOSED',
  evidence_refs         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  source_ref            text,
  source_revision       text,
  workspace_revision    text,
  reviewed_by           text,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_feature_concept_crosswalk_pk PRIMARY KEY (source_namespace, local_feature_id, crosswalk_revision),
  CONSTRAINT atlas_feature_concept_crosswalk_revision_positive CHECK (crosswalk_revision >= 1),
  CONSTRAINT atlas_feature_concept_crosswalk_status_valid CHECK (crosswalk_status IN ('PROPOSED', 'REVIEWED', 'WITHDRAWN', 'SUPERSEDED')),
  CONSTRAINT atlas_feature_concept_crosswalk_target_required CHECK (
    crosswalk_status <> 'REVIEWED' OR canonical_feature_id IS NOT NULL
  ),
  CONSTRAINT atlas_feature_concept_crosswalk_reviewed_consistent CHECK (
    crosswalk_status NOT IN ('REVIEWED', 'WITHDRAWN') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT atlas_feature_concept_crosswalk_evidence_is_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
  CONSTRAINT atlas_feature_concept_crosswalk_source_qualified CHECK (
    crosswalk_status = 'PROPOSED' OR (source_ref IS NOT NULL AND source_revision IS NOT NULL)
  )
);

-- 4. Foreign keys (guarded for replay).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atlas_feature_concept_crosswalk_identity_fk') THEN
    ALTER TABLE atlas_feature_concept_crosswalk
      ADD CONSTRAINT atlas_feature_concept_crosswalk_identity_fk
      FOREIGN KEY (source_namespace, local_feature_id) REFERENCES atlas_feature_source_identities (source_namespace, local_feature_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atlas_feature_concept_crosswalk_target_fk') THEN
    ALTER TABLE atlas_feature_concept_crosswalk
      ADD CONSTRAINT atlas_feature_concept_crosswalk_target_fk
      FOREIGN KEY (canonical_feature_id) REFERENCES atlas_feature_concepts (canonical_feature_id) ON DELETE RESTRICT;
  END IF;
END
$$;

-- 5. Labels reference concepts (replaces the earlier FK that pointed at atlas_features; that FK is wrong).
CREATE TABLE IF NOT EXISTS atlas_feature_labels (
  canonical_feature_id  text        NOT NULL REFERENCES atlas_feature_concepts (canonical_feature_id) ON DELETE RESTRICT,
  label_revision        integer     NOT NULL DEFAULT 1,
  feature_label         text        NOT NULL,
  community_id          integer,
  domain_class          text,
  capability            text,
  concept_id            text,
  label_source          text        NOT NULL,
  label_status          text        NOT NULL DEFAULT 'PROPOSED',
  evidence_refs         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by           text,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_feature_labels_pk PRIMARY KEY (canonical_feature_id, label_revision),
  CONSTRAINT atlas_feature_labels_revision_positive CHECK (label_revision >= 1),
  CONSTRAINT atlas_feature_labels_label_nonblank CHECK (btrim(feature_label) <> ''),
  CONSTRAINT atlas_feature_labels_status_valid CHECK (label_status IN ('PROPOSED', 'REVIEWED', 'WITHDRAWN', 'SUPERSEDED')),
  CONSTRAINT atlas_feature_labels_reviewed_consistent CHECK (
    label_status NOT IN ('REVIEWED', 'WITHDRAWN') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT atlas_feature_labels_evidence_is_array CHECK (jsonb_typeof(evidence_refs) = 'array')
);

-- 6. Indexes for the current-decision lookups.
CREATE INDEX IF NOT EXISTS atlas_feature_concept_crosswalk_current_idx
  ON atlas_feature_concept_crosswalk (source_namespace, local_feature_id, crosswalk_revision DESC)
  WHERE crosswalk_status IN ('REVIEWED', 'WITHDRAWN');
CREATE INDEX IF NOT EXISTS atlas_feature_concept_crosswalk_target_idx ON atlas_feature_concept_crosswalk (canonical_feature_id);
CREATE INDEX IF NOT EXISTS atlas_feature_labels_current_idx
  ON atlas_feature_labels (canonical_feature_id, label_revision DESC)
  WHERE label_status IN ('REVIEWED', 'WITHDRAWN');

-- 7. Latest-decision current views. A WITHDRAWN latest decision yields no row.
CREATE OR REPLACE VIEW atlas_feature_concept_crosswalk_current AS
SELECT source_namespace, local_feature_id, crosswalk_revision, canonical_feature_id, reviewed_by, reviewed_at
FROM (
  SELECT DISTINCT ON (source_namespace, local_feature_id)
    source_namespace, local_feature_id, crosswalk_revision, canonical_feature_id, crosswalk_status, reviewed_by, reviewed_at
  FROM atlas_feature_concept_crosswalk
  WHERE crosswalk_status IN ('REVIEWED', 'WITHDRAWN')
  ORDER BY source_namespace, local_feature_id, crosswalk_revision DESC
) latest_decision
WHERE latest_decision.crosswalk_status = 'REVIEWED';

CREATE OR REPLACE VIEW atlas_feature_labels_current AS
SELECT canonical_feature_id, label_revision, feature_label, community_id, domain_class, capability, concept_id, label_source, reviewed_by, reviewed_at
FROM (
  SELECT DISTINCT ON (canonical_feature_id)
    canonical_feature_id, label_revision, feature_label, community_id, domain_class, capability, concept_id,
    label_source, reviewed_by, reviewed_at, label_status
  FROM atlas_feature_labels
  WHERE label_status IN ('REVIEWED', 'WITHDRAWN')
  ORDER BY canonical_feature_id, label_revision DESC
) latest_decision
WHERE latest_decision.label_status = 'REVIEWED';

-- 8. updated_at maintenance on every table with a mutable lifecycle.
CREATE OR REPLACE FUNCTION atlas_feature_identity_v2_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atlas_feature_concepts_touch ON atlas_feature_concepts;
CREATE TRIGGER atlas_feature_concepts_touch BEFORE UPDATE ON atlas_feature_concepts
  FOR EACH ROW EXECUTE FUNCTION atlas_feature_identity_v2_touch_updated_at();
DROP TRIGGER IF EXISTS atlas_feature_source_identities_touch ON atlas_feature_source_identities;
CREATE TRIGGER atlas_feature_source_identities_touch BEFORE UPDATE ON atlas_feature_source_identities
  FOR EACH ROW EXECUTE FUNCTION atlas_feature_identity_v2_touch_updated_at();
DROP TRIGGER IF EXISTS atlas_feature_concept_crosswalk_touch ON atlas_feature_concept_crosswalk;
CREATE TRIGGER atlas_feature_concept_crosswalk_touch BEFORE UPDATE ON atlas_feature_concept_crosswalk
  FOR EACH ROW EXECUTE FUNCTION atlas_feature_identity_v2_touch_updated_at();
DROP TRIGGER IF EXISTS atlas_feature_labels_touch ON atlas_feature_labels;
CREATE TRIGGER atlas_feature_labels_touch BEFORE UPDATE ON atlas_feature_labels
  FOR EACH ROW EXECUTE FUNCTION atlas_feature_identity_v2_touch_updated_at();

-- 9. No rows are written here. Minting concepts, registering source identities, and writing crosswalk
--    decisions are separate authorized operations with their own receipts.

COMMIT;
