-- Deterministic domain-vocabulary crosswalk (2026-10-18). ADDITIVE and idempotent.
-- Bridges three existing string vocabularies to domain_taxonomy_v1.domain_id:
--   feature_domain.domain_class, codebase_chunk_index.domain, domain_taxonomy_v1 itself.
-- Match rule is NORMALIZED_EXACT only: lowercase + strip non-alphanumerics, equal to a
-- top-level or child domain_id. No similarity, no inferred aliases; everything else is
-- UNRESOLVED. canonical = false; domain_taxonomy_v1 / atlas_domain_ontology stay the owner.
-- No identity is minted; join to packets stays on packet_key (never feature_id alone).

CREATE TABLE IF NOT EXISTS atlas_domain_vocabulary_crosswalk_v1 (
  source_vocab        text    NOT NULL,
  source_value        text    NOT NULL,
  taxonomy_domain_id  text,
  match_method        text    NOT NULL CHECK (match_method IN ('NORMALIZED_EXACT', 'UNRESOLVED')),
  source_row_count    bigint  NOT NULL,
  crosswalk_version   text    NOT NULL DEFAULT 'atlas.domain-vocab-crosswalk.v1',
  canonical           boolean NOT NULL DEFAULT false CHECK (canonical = false),
  built_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_vocab, source_value, crosswalk_version),
  CHECK ((match_method = 'UNRESOLVED') = (taxonomy_domain_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_domain_vocab_crosswalk_v1_taxonomy
  ON atlas_domain_vocabulary_crosswalk_v1 (taxonomy_domain_id)
  WHERE taxonomy_domain_id IS NOT NULL;

WITH tax AS (
  SELECT domain_id, lower(regexp_replace(domain_id, '[^a-zA-Z0-9]', '', 'g')) AS norm
    FROM domain_taxonomy_v1
   WHERE is_active
),
src AS (
  SELECT 'feature_domain.domain_class'::text AS source_vocab,
         domain_class AS source_value,
         count(*) AS n
    FROM feature_domain
   GROUP BY domain_class
  UNION ALL
  SELECT 'codebase_chunk_index.domain',
         COALESCE(domain, ''),
         count(*)
    FROM codebase_chunk_index
   GROUP BY COALESCE(domain, '')
)
INSERT INTO atlas_domain_vocabulary_crosswalk_v1
       (source_vocab, source_value, taxonomy_domain_id, match_method, source_row_count)
SELECT s.source_vocab,
       s.source_value,
       t.domain_id,
       CASE WHEN t.domain_id IS NULL THEN 'UNRESOLVED' ELSE 'NORMALIZED_EXACT' END,
       s.n
  FROM src s
  LEFT JOIN tax t
    ON s.source_value <> ''
   AND lower(regexp_replace(s.source_value, '[^a-zA-Z0-9]', '', 'g')) = t.norm
ON CONFLICT (source_vocab, source_value, crosswalk_version) DO NOTHING;
