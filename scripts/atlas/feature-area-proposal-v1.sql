-- Feature-area PROPOSAL (read-only, deterministic, no model, no datastore writes). Run from the repo root:
--   ATLAS_PACKETS=<csv: packet_key,source_ref,feature_id,feature_label> duckdb -c ".read scripts/atlas/feature-area-proposal-v1.sql"
-- Output: .tmp/atlas/feature_area_proposal.parquet (packet_key, source_ref, current labels, ref_kind, proposed_feature_area, rule_id).
-- Why: atlas_packets.feature_label equals the file basename for ~95% of packets (see the feature-label-semantic-derivation OpenSpec change),
-- so it does not classify. This derives a coarse AREA from the path, one explicit rule per ref kind, so a reviewer can accept or override it.
-- It is NOT feature_label/feature_id, never mutates canonical rows, and carries no identity: packet_key is read only as the join handle.
-- The owner for semantic labels (summary-derived, human-gated Phase 5) stays openspec/changes/feature-label-semantic-derivation.

CREATE OR REPLACE TEMP TABLE pk AS
SELECT packet_key, source_ref, feature_id, feature_label FROM read_csv(getenv('ATLAS_PACKETS'), all_varchar = true);

CREATE OR REPLACE TEMP TABLE parsed AS
SELECT *,
  CASE WHEN regexp_matches(source_ref, '^[a-z_]+:') AND NOT regexp_matches(source_ref, '^[a-z_]+:[\\/]') THEN 'SCHEME_REF'
       WHEN source_ref LIKE '%/%' OR source_ref LIKE '%.%' THEN 'PATH' ELSE 'OTHER' END AS ref_kind,
  string_split(regexp_replace(source_ref, '^sveltekit-frontend/', ''), '/') AS parts
FROM pk;

CREATE OR REPLACE TEMP TABLE proposed AS
SELECT packet_key, source_ref, feature_id, feature_label, ref_kind,
  CASE
    WHEN ref_kind = 'SCHEME_REF' THEN split_part(source_ref, ':', 1) || ':' || split_part(split_part(source_ref, ':', 2), '.', 1)
    WHEN ref_kind = 'PATH' AND parts[1] = 'src' AND parts[2] = 'lib' AND len(parts) > 3 THEN 'lib.' || array_to_string(list_slice(parts, 3, least(len(parts) - 1, 4)), '.')
    WHEN ref_kind = 'PATH' AND parts[1] = 'src' AND parts[2] = 'routes' THEN 'routes.' || coalesce(nullif(array_to_string(list_slice(list_filter(parts, x -> NOT regexp_matches(x, '^\\(.*\\)$')), 3, least(len(list_filter(parts, x -> NOT regexp_matches(x, '^\\(.*\\)$'))) - 1, 5)), '.'), ''), 'root')
    WHEN ref_kind = 'PATH' AND parts[1] = 'src' AND len(parts) > 2 THEN 'src.' || array_to_string(list_slice(parts, 2, least(len(parts) - 1, 3)), '.')
    WHEN ref_kind = 'PATH' AND len(parts) > 2 THEN array_to_string(list_slice(parts, 1, 2), '.')
    WHEN ref_kind = 'PATH' AND len(parts) = 2 THEN parts[1]
    ELSE 'root'
  END AS proposed_feature_area,
  CASE WHEN ref_kind = 'SCHEME_REF' THEN 'R1_SCHEME_REF'
       WHEN ref_kind = 'PATH' AND parts[1] = 'src' AND parts[2] = 'lib' AND len(parts) > 3 THEN 'R2_FRONTEND_LIB'
       WHEN ref_kind = 'PATH' AND parts[1] = 'src' AND parts[2] = 'routes' THEN 'R3_FRONTEND_ROUTES'
       WHEN ref_kind = 'PATH' AND parts[1] = 'src' AND len(parts) > 2 THEN 'R4_FRONTEND_OTHER'
       WHEN ref_kind = 'PATH' THEN 'R5_REPO_PATH' ELSE 'R6_FALLBACK' END AS rule_id
FROM parsed;

COPY (SELECT * FROM proposed ORDER BY packet_key) TO '.tmp/atlas/feature_area_proposal.parquet' (FORMAT parquet, COMPRESSION zstd);

SELECT count(*) AS packets,
       count(DISTINCT feature_label) AS current_distinct_labels,
       count(DISTINCT proposed_feature_area) AS proposed_distinct_areas,
       count(*) FILTER (WHERE rule_id = 'R6_FALLBACK') AS fallback_rows
FROM proposed;
SELECT rule_id, count(*) AS n FROM proposed GROUP BY 1 ORDER BY 2 DESC;
SELECT proposed_feature_area, count(*) AS n FROM proposed GROUP BY 1 ORDER BY 2 DESC LIMIT 8;
