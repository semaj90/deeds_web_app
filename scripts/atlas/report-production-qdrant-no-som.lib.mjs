export const GENERATED_FILTER = `
  clean_ref NOT LIKE 'scripts/api-cleanup/reports/%'
  AND clean_ref NOT LIKE 'scripts/case_data/_cache/%'
  AND clean_ref NOT LIKE 'scripts/tests/performance-results/%'
  AND clean_ref NOT LIKE 'scripts/tests/agent-investigate-results/%'
  AND clean_ref NOT LIKE 'scripts/unsloth-training/COLAB_PACKAGE/%'
  AND clean_ref NOT LIKE 'scripts/atlas/out/%'
  AND clean_ref NOT LIKE 'turbovec/%'
  AND clean_ref NOT LIKE 'docker/langgraph-synthesis/.venv/%'
  AND clean_ref NOT LIKE '%.venv/%'
  AND clean_ref NOT LIKE '%/node_modules/%'
  AND clean_ref NOT LIKE '%/dist-info/%'
  AND clean_ref NOT LIKE '%/site-packages/%'
`;

export const NORMALIZED_COVERAGE_CTE = `
  WITH normalized_afm AS (
    SELECT
      afm.*,
      regexp_replace(regexp_replace(afm.source_ref, '^(\\.\\./)+', ''), '^sveltekit-frontend/', '') AS norm_source_ref,
      regexp_replace(regexp_replace(afm.source_ref, '^(\\.\\./)+', ''), '^sveltekit-frontend/', '') AS clean_ref
    FROM atlas_feature_map afm
  ),
  deduped_afm AS (
    SELECT
      clean_ref AS source_ref,
      clean_ref AS normalized_path,
      clean_ref AS norm_source_ref,
      clean_ref,
      MAX(feature_id) FILTER (WHERE feature_id IS NOT NULL) AS feature_id,
      MAX(cluster_id) FILTER (WHERE cluster_id IS NOT NULL) AS cluster_id,
      MAX(centroid_id) FILTER (WHERE centroid_id IS NOT NULL) AS centroid_id,
      MAX(som_cluster) FILTER (WHERE som_cluster IS NOT NULL) AS som_cluster,
      MAX(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL) AS qdrant_point_id,
      MAX(indexed_at) AS indexed_at
    FROM normalized_afm
    GROUP BY clean_ref
  ),
  normalized_pad AS (
    SELECT
      pad.*,
      regexp_replace(regexp_replace(pad.source_ref, '^(\\.\\./)+', ''), '^sveltekit-frontend/', '') AS norm_source_ref
    FROM parent_atlas_documents pad
  ),
  joined AS (
    SELECT
      afm.*,
      pad.tags,
      pad.source_kind,
      pad.index_lane,
      pad.profile_card_visible
    FROM deduped_afm afm
    LEFT JOIN normalized_pad pad
      ON pad.norm_source_ref = afm.norm_source_ref
  ),
  active AS (
    SELECT *
    FROM joined
    WHERE COALESCE(profile_card_visible, true) = true
      AND COALESCE(source_kind, 'source') NOT IN ('vendor', 'dependency', 'generated')
      AND COALESCE(index_lane, 'source') NOT IN ('vendor', 'dependency', 'generated')
      AND COALESCE(NOT ('vendor' = ANY(tags)), true)
      AND COALESCE(NOT ('excluded_from_profile_cards' = ANY(tags)), true)
      AND ${GENERATED_FILTER}
  )
`;

export function normalizeSourceRef(sourceRef) {
  return String(sourceRef ?? '')
    .replace(/^(\.\.\/)+/, '')
    .replace(/^sveltekit-frontend\//, '');
}

export function bucketFor(ref) {
  const clean = normalizeSourceRef(ref);
  const parts = clean.split('/');
  return [parts[0], parts[1], parts[2]].filter(Boolean).join('/');
}

export function isActiveCoverageRow(row) {
  const tags = Array.isArray(row?.tags) ? row.tags : [];
  const sourceRef = normalizeSourceRef(row?.source_ref ?? '');
  const sourceKind = String(row?.source_kind ?? 'source');
  const indexLane = String(row?.index_lane ?? 'source');
  const profileCardVisible = row?.profile_card_visible ?? true;

  return profileCardVisible === true
    && !['vendor', 'dependency', 'generated'].includes(sourceKind)
    && !['vendor', 'dependency', 'generated'].includes(indexLane)
    && !tags.includes('vendor')
    && !tags.includes('excluded_from_profile_cards')
    && !sourceRef.startsWith('scripts/api-cleanup/reports/')
    && !sourceRef.startsWith('scripts/case_data/_cache/')
    && !sourceRef.startsWith('scripts/tests/performance-results/')
    && !sourceRef.startsWith('scripts/tests/agent-investigate-results/')
    && !sourceRef.startsWith('scripts/unsloth-training/COLAB_PACKAGE/')
    && !sourceRef.startsWith('scripts/atlas/out/');
}
