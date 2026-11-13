-- ORF cluster-projection provenance for revision-qualified SOM/radix proposals.
-- Proposal only; do not apply this sidecar to a live database without operator approval.
-- Existing scalar KMeans/SOM columns remain a rebuildable projection. This nullable JSONB
-- preserves the complete ClusterFeatureProjectionV1 receipt used to produce those values.

ALTER TABLE IF EXISTS atlas_observation_feature_rows
  ADD COLUMN IF NOT EXISTS cluster_feature_projection jsonb;

DO $$
BEGIN
  IF to_regclass('public.atlas_observation_feature_rows') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'atlas_observation_feature_rows_cluster_projection_object_ck'
         AND conrelid = 'public.atlas_observation_feature_rows'::regclass
     ) THEN
    ALTER TABLE public.atlas_observation_feature_rows
      ADD CONSTRAINT atlas_observation_feature_rows_cluster_projection_object_ck
      CHECK (cluster_feature_projection IS NULL OR jsonb_typeof(cluster_feature_projection) = 'object');
  END IF;
END
$$;

COMMENT ON COLUMN atlas_observation_feature_rows.cluster_feature_projection IS
  'Optional revisioned ClusterFeatureProjectionV1; proposal metadata only, never canonical identity or ranking authority.';
