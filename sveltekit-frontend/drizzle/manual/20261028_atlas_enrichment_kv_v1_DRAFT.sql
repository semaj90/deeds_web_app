-- DRAFT, NOT APPLIED. Additive key/value enrichment store (HINT-level, non-canonical). Do not apply without explicit operator approval.
--
-- Pre-image (read-only check 2026-10-28 on legal_ai_db): to_regclass('atlas_enrichment_kv_v1') IS NULL; no table is altered.
-- Why a new table and not ALTER: registry_enrichment_projection (61,659 rows) is per-packet and keyed by a unique packet_key with array columns;
-- ace_context_packets is a request-local cache (0 rows). Directory/file/feature key/value hints have no packet_key. atlas.ace-packet.v3 requires a
-- canonical packet_key from PostgreSQL, so nothing here mints or replaces a packet: rows are inputs an authorized composer may attach as HINT sections.
-- Rules: canonical is forced false by CHECK (never filter it with canonical = true); immutable per evidence_digest (a changed digest adds rows,
-- history is kept, nothing is deleted); PG18-safe numeric guard (no isfinite on float8).
--
-- Rollback (operator-run only, not part of this file's execution): DROP VIEW v_atlas_enrichment_kv_latest_v1; DROP TABLE atlas_enrichment_kv_v1;
-- Post-check: SELECT count(*) FROM atlas_enrichment_kv_v1; SELECT count(*) FROM v_atlas_enrichment_kv_latest_v1; \d atlas_enrichment_kv_v1

CREATE TABLE IF NOT EXISTS atlas_enrichment_kv_v1 (
  id              bigserial PRIMARY KEY,
  schema_version  text        NOT NULL DEFAULT 'atlas.kv-enrichment.v1',
  subject_kind    text        NOT NULL CHECK (subject_kind IN ('directory', 'file', 'feature', 'packet')),
  subject_id      text        NOT NULL,
  key             text        NOT NULL CHECK (length(key) BETWEEN 1 AND 128),
  value_type      text        NOT NULL CHECK (value_type IN ('number', 'string')),
  value_num       double precision,
  value_str       text,
  source          text        NOT NULL CHECK (length(source) BETWEEN 1 AND 128),
  status          text        NOT NULL CHECK (status IN ('HINT', 'PENDING', 'STALE')),
  evidence_digest text        NOT NULL CHECK (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonical       boolean     NOT NULL DEFAULT false CHECK (canonical = false),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_enrichment_kv_v1_value_shape CHECK (
    (value_type = 'number' AND value_num IS NOT NULL AND value_str IS NULL)
    OR (value_type = 'string' AND value_str IS NOT NULL AND value_num IS NULL)),
  CONSTRAINT atlas_enrichment_kv_v1_value_finite CHECK (
    value_num IS NULL OR value_num NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  CONSTRAINT atlas_enrichment_kv_v1_identity UNIQUE (subject_kind, subject_id, key, evidence_digest)
);

CREATE INDEX IF NOT EXISTS idx_atlas_enrichment_kv_v1_subject ON atlas_enrichment_kv_v1 (subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS idx_atlas_enrichment_kv_v1_key_num ON atlas_enrichment_kv_v1 (key, value_num) WHERE value_type = 'number';
CREATE INDEX IF NOT EXISTS idx_atlas_enrichment_kv_v1_digest ON atlas_enrichment_kv_v1 (evidence_digest);

-- Latest row per (subject, key): newest created_at, then highest id. History stays in the table.
CREATE OR REPLACE VIEW v_atlas_enrichment_kv_latest_v1 AS
SELECT DISTINCT ON (subject_kind, subject_id, key)
       subject_kind, subject_id, key, value_type, value_num, value_str, source, status, evidence_digest, created_at
FROM atlas_enrichment_kv_v1
ORDER BY subject_kind, subject_id, key, created_at DESC, id DESC;
