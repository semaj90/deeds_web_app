-- DRAFT — NOT APPLIED. Do not run against legal_ai_db without an explicit operator authorization.
--
-- Versioned feature label registry. Additive only: creates one table, one view, one trigger and
-- indexes. It drops nothing and writes no rows.
--
-- Ownership (verified live 2026-10-20):
--   * atlas_feature_labels.feature_id references atlas_features(feature_id), the existing
--     source-local feature identity owner defined by 20260716_atlas_knowledge_layer.sql.
--     atlas_feature_labels does not reference canonical_feature_concepts: that registry is the
--     separate reviewed target of atlas_feature_crosswalk, not the owner of local feature_id.
--   * atlas_feature_map (4,748 rows), atlas_feature_aliases and atlas_feature_evidence keep their
--     own roles. No feature_label column is added to any mapping table.
--   * atlas_feature_recommendation_index is derived and never a source of approved labels.
--
-- Lifecycle semantics (explicit, so no transition is inferred from revision order alone):
--   PROPOSED    a candidate label; never current.
--   REVIEWED    an approval decision; current when it is the latest review decision for the feature.
--   WITHDRAWN   an explicit review decision that withdraws the feature label. If it is the latest
--               review decision, the feature has NO current label.
--   SUPERSEDED  a historical description only: an older approval replaced by a later REVIEWED
--               revision. It never withdraws anything and never becomes current by itself.
-- Current approved label: atlas_feature_labels_current returns, per feature_id, the REVIEWED row
-- with the highest label_revision, but only if no WITHDRAWN decision has a higher revision.
--
-- Domain vocabulary is three different things and is stored in separate columns:
--   domain_class   a technical domain (for example 'ui', 'auth'), from the canonical 9-domain taxonomy
--   capability     a product capability (for example 'video_editor'); free text, not a domain
--   concept_id     an ontology concept reference; NULL until the concept registry resolves it
-- They are not interchangeable identifiers.
--
-- Rollback: drizzle/manual/20261020_atlas_feature_labels_v1.rollback.sql (not executed).
-- Independent readback: see the contract test and the readback query in the rollout notes.

BEGIN;

-- 1. Table
CREATE TABLE IF NOT EXISTS atlas_feature_labels (
  feature_id       text        NOT NULL,
  label_revision   integer     NOT NULL DEFAULT 1,
  feature_label    text        NOT NULL,
  community_id     integer,
  domain_class     text,
  capability       text,
  concept_id       text,
  label_source     text        NOT NULL,
  label_status     text        NOT NULL DEFAULT 'PROPOSED',
  evidence_refs    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by      text,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_feature_labels_pk PRIMARY KEY (feature_id, label_revision),
  CONSTRAINT atlas_feature_labels_revision_positive CHECK (label_revision >= 1),
  CONSTRAINT atlas_feature_labels_label_nonblank CHECK (btrim(feature_label) <> ''),
  CONSTRAINT atlas_feature_labels_status_valid CHECK (label_status IN ('PROPOSED', 'REVIEWED', 'SUPERSEDED', 'WITHDRAWN')),
  CONSTRAINT atlas_feature_labels_reviewed_consistent CHECK (
    label_status NOT IN ('REVIEWED', 'WITHDRAWN') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT atlas_feature_labels_evidence_is_array CHECK (jsonb_typeof(evidence_refs) = 'array')
);

-- 2. Identity ownership: a label must reference an existing feature identity.
--    Guarded because ADD CONSTRAINT has no IF NOT EXISTS form.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'atlas_feature_labels_feature_fk'
  ) THEN
    ALTER TABLE atlas_feature_labels
      ADD CONSTRAINT atlas_feature_labels_feature_fk
      FOREIGN KEY (feature_id) REFERENCES atlas_features (feature_id) ON DELETE RESTRICT;
  END IF;
END
$$;

-- 3. Columns added after the first draft (idempotent)
ALTER TABLE atlas_feature_labels ADD COLUMN IF NOT EXISTS capability text;
ALTER TABLE atlas_feature_labels ADD COLUMN IF NOT EXISTS concept_id text;
ALTER TABLE atlas_feature_labels ADD COLUMN IF NOT EXISTS evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE atlas_feature_labels ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE atlas_feature_labels ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- 4. Indexes, each for a query the admin view or the current-label view actually runs
--    (current-label lookup: DISTINCT ON feature_id ... WHERE label_status = 'REVIEWED' ORDER BY label_revision DESC)
CREATE INDEX IF NOT EXISTS atlas_feature_labels_current_idx
  ON atlas_feature_labels (feature_id, label_revision DESC) WHERE label_status IN ('REVIEWED', 'WITHDRAWN');
CREATE INDEX IF NOT EXISTS atlas_feature_labels_label_idx ON atlas_feature_labels (feature_label);
CREATE INDEX IF NOT EXISTS atlas_feature_labels_domain_idx ON atlas_feature_labels (domain_class);
CREATE INDEX IF NOT EXISTS atlas_feature_labels_status_idx ON atlas_feature_labels (label_status);

-- 5. Current approved label, deterministic: highest reviewed revision per feature.
CREATE OR REPLACE VIEW atlas_feature_labels_current AS
SELECT feature_id, label_revision, feature_label, community_id, domain_class, capability, concept_id,
       label_source, reviewed_by, reviewed_at
FROM (
  SELECT DISTINCT ON (feature_id)
    feature_id, label_revision, feature_label, community_id, domain_class, capability, concept_id,
    label_source, reviewed_by, reviewed_at, label_status
  FROM atlas_feature_labels
  WHERE label_status IN ('REVIEWED', 'WITHDRAWN')
  ORDER BY feature_id, label_revision DESC
) latest_decision
WHERE latest_decision.label_status = 'REVIEWED';

-- 6. UPDATE behaviour: keep updated_at current on every row change.
CREATE OR REPLACE FUNCTION atlas_feature_labels_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atlas_feature_labels_touch ON atlas_feature_labels;
CREATE TRIGGER atlas_feature_labels_touch
  BEFORE UPDATE ON atlas_feature_labels
  FOR EACH ROW EXECUTE FUNCTION atlas_feature_labels_touch_updated_at();

-- 7. No data is written here. The dry-run backfill report and any approved backfill are separate
--    artifacts with their own receipts. No approved label is inferred from recommendation rows,
--    model output, or unreviewed ontology tuples.

COMMIT;
-- SUPERSEDED UNAPPLIED DRAFT: use 20261021_feature_identity_v2.sql for the proposed canonical-concept label contract.
