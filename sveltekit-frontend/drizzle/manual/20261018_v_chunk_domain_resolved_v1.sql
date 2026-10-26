-- Read-only, versioned domain join (2026-10-18). A VIEW: no table rewrite, no index maintenance, no write cost.
-- Pinned to ONE immutable crosswalk version and to NORMALIZED_EXACT rows (the crosswalk is canonical = false by
-- design, so a "canonical = true" filter would match nothing). Unresolved values stay unresolved (taxonomy_domain_id NULL).
-- Replaces the need for codebase_chunk_index.domain_id (DOMAIN-ID-COLUMN-01): the 2,214 stored values equal this join.
CREATE OR REPLACE VIEW v_chunk_domain_resolved_v1 AS
SELECT c.id                         AS chunk_id,
       c.source_ref,
       c.source_revision,
       c.domain                     AS source_domain,
       x.taxonomy_domain_id,
       CASE WHEN x.taxonomy_domain_id IS NULL THEN 'UNRESOLVED' ELSE 'NORMALIZED_EXACT' END AS match_method,
       'atlas.domain-vocab-crosswalk.v1'::text AS crosswalk_version,
       false                        AS canonical
  FROM codebase_chunk_index c
  LEFT JOIN atlas_domain_vocabulary_crosswalk_v1 x
    ON x.source_vocab = 'codebase_chunk_index.domain'
   AND x.source_value = COALESCE(c.domain, '')
   AND x.crosswalk_version = 'atlas.domain-vocab-crosswalk.v1'
   AND x.match_method = 'NORMALIZED_EXACT';
