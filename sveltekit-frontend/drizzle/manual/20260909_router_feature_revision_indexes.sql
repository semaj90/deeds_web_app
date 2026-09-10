-- Parent Atlas router/matrix storage alignment.
-- Active feature-row owner: atlas_observation_feature_rows.
-- Do not create the historical atlas_feature_matrix_rows table.
-- workspace_revision remains nullable until snapshot/tournament admission.

BEGIN;

ALTER TABLE IF EXISTS atlas_observation_feature_rows
  ALTER COLUMN workspace_revision TYPE text
  USING workspace_revision::text;

CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_feature_revision_idx
  ON atlas_observation_feature_rows (feature_revision, packet_key);

CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_workspace_packet_idx
  ON atlas_observation_feature_rows (workspace_revision, packet_key)
  WHERE workspace_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_packets_workspace_representation_idx
  ON atlas_packets (workspace_revision, representation_revision, packet_key)
  WHERE workspace_revision IS NOT NULL;

COMMIT;
