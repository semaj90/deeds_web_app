CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS feature_packet_bindings
  ADD COLUMN IF NOT EXISTS feature_key text,
  ADD COLUMN IF NOT EXISTS binding_kind text,
  ADD COLUMN IF NOT EXISTS join_method text,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS processing_pass_id uuid;

ALTER TABLE IF EXISTS feature_packet_bindings
  ALTER COLUMN feature_id DROP NOT NULL,
  ALTER COLUMN binding_type DROP NOT NULL,
  ALTER COLUMN source_ref DROP NOT NULL,
  ALTER COLUMN confidence TYPE double precision USING confidence::double precision,
  ALTER COLUMN confidence DROP NOT NULL;

UPDATE feature_packet_bindings
SET
  feature_key = COALESCE(feature_key, feature_id),
  binding_kind = COALESCE(binding_kind, binding_type, 'derived'),
  join_method = COALESCE(join_method, 'migration'),
  evidence = COALESCE(evidence, '{}'::jsonb),
  processing_pass_id = COALESCE(processing_pass_id, gen_random_uuid())
WHERE feature_key IS NULL
   OR binding_kind IS NULL
   OR join_method IS NULL
   OR processing_pass_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS feature_packet_bindings_identity_uq
  ON feature_packet_bindings (feature_key, packet_key, binding_kind);

CREATE INDEX IF NOT EXISTS feature_packet_bindings_feature_idx
  ON feature_packet_bindings (feature_key);

CREATE INDEX IF NOT EXISTS feature_packet_bindings_packet_idx
  ON feature_packet_bindings (packet_key);

CREATE INDEX IF NOT EXISTS feature_packet_bindings_source_idx
  ON feature_packet_bindings (source_ref);

CREATE INDEX IF NOT EXISTS feature_packet_bindings_kind_idx
  ON feature_packet_bindings (binding_kind);

DROP TABLE IF EXISTS feature_domain_predictions;
