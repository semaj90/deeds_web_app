-- Proposed additive extension to the active packet-key ORF owner.
-- Do not apply until migration-owner review and explicit operator approval.
BEGIN;

ALTER TABLE public.atlas_observation_feature_rows
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS registry_revision text;

COMMENT ON COLUMN public.atlas_observation_feature_rows.source_revision IS
  'Exact source bytes revision for this source-local feature observation; NULL means legacy/unqualified.';
COMMENT ON COLUMN public.atlas_observation_feature_rows.registry_revision IS
  'Feature-definition registry revision used to produce the observation; NULL means legacy/unqualified.';

COMMIT;
