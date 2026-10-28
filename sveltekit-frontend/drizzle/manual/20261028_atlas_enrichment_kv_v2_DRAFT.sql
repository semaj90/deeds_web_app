-- DRAFT ONLY. Revision-qualified directory/file/feature HINT storage.
-- Do not apply without a separate explicit operator approval.
-- This v2 draft supersedes the v1 proposal for new outputs; it does not alter
-- existing tables, create ACE packets, or authorize packet/relation promotion.
-- Required provenance comes from the admitted inventory manifest and producer;
-- directory paths and evidence digests are not substitutes for workspace identity.
--
-- Rehearsal contract: apply twice; COPY v2 output; verify counts and per-revision
-- totals; reject invalid digests, wrong value shapes, NaN, canonical=true, and
-- duplicate evidence; confirm revision-filtered lookups and index plans.
-- Rollback is operator-only: DROP VIEW v_atlas_enrichment_kv_latest_v2;
-- DROP TABLE atlas_enrichment_kv_v2.

CREATE TABLE IF NOT EXISTS atlas_enrichment_kv_v2 (
  id                       bigserial PRIMARY KEY,
  schema_version           text        NOT NULL DEFAULT 'atlas.kv-enrichment.v2',
  subject_kind             text        NOT NULL CHECK (subject_kind IN ('directory', 'file', 'feature')),
  subject_id               text        NOT NULL,
  key                      text        NOT NULL CHECK (length(key) BETWEEN 1 AND 128),
  value_type               text        NOT NULL CHECK (value_type IN ('number', 'string')),
  value_num                double precision,
  value_str                text,
  source                   text        NOT NULL CHECK (length(source) BETWEEN 1 AND 128),
  status                   text        NOT NULL CHECK (status IN ('HINT', 'PENDING', 'STALE')),
  workspace_revision       text        NOT NULL CHECK (workspace_revision ~ '^sha256:[0-9a-f]{64}$'),
  inventory_manifest_digest text       NOT NULL CHECK (inventory_manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  producer_revision        text        NOT NULL CHECK (length(producer_revision) BETWEEN 1 AND 128),
  evidence_digest          text        NOT NULL CHECK (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonical                boolean     NOT NULL DEFAULT false CHECK (canonical = false),
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_enrichment_kv_v2_value_shape CHECK (
    (value_type = 'number' AND value_num IS NOT NULL AND value_str IS NULL)
    OR (value_type = 'string' AND value_str IS NOT NULL AND value_num IS NULL)),
  CONSTRAINT atlas_enrichment_kv_v2_value_finite CHECK (
    value_num IS NULL OR value_num NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  CONSTRAINT atlas_enrichment_kv_v2_identity UNIQUE
    (subject_kind, subject_id, key, workspace_revision, inventory_manifest_digest, producer_revision, evidence_digest)
);

CREATE INDEX IF NOT EXISTS idx_atlas_enrichment_kv_v2_subject_revision
  ON atlas_enrichment_kv_v2 (subject_kind, workspace_revision, subject_id);
CREATE INDEX IF NOT EXISTS idx_atlas_enrichment_kv_v2_revision_key_num
  ON atlas_enrichment_kv_v2 (workspace_revision, key, value_num) WHERE value_type = 'number';
CREATE INDEX IF NOT EXISTS idx_atlas_enrichment_kv_v2_digest
  ON atlas_enrichment_kv_v2 (inventory_manifest_digest, evidence_digest);

CREATE OR REPLACE VIEW v_atlas_enrichment_kv_latest_v2 AS
SELECT DISTINCT ON (subject_kind, subject_id, key, workspace_revision, inventory_manifest_digest)
       subject_kind, subject_id, key, value_type, value_num, value_str, source, status,
       workspace_revision, inventory_manifest_digest, producer_revision, evidence_digest, created_at
FROM atlas_enrichment_kv_v2
ORDER BY subject_kind, subject_id, key, workspace_revision, inventory_manifest_digest, created_at DESC, id DESC;
