-- Immutable ContextManifestV2 payload/readback owner.
-- Design-only: do not apply until migration-owner review and explicit approval.

CREATE TABLE IF NOT EXISTS public.atlas_context_manifest_v2_readbacks (
  identity_checksum text PRIMARY KEY
    CHECK (identity_checksum ~ '^[a-f0-9]{64}$'),
  request_id text NOT NULL,
  snapshot_id text NOT NULL,
  manifest_json jsonb NOT NULL,
  manifest_payload_checksum text NOT NULL
    CHECK (manifest_payload_checksum ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_context_manifest_v2_readbacks_schema_check
    CHECK (manifest_json->>'schema' = 'atlas.context-manifest.v2'),
  CONSTRAINT atlas_context_manifest_v2_readbacks_identity_check
    CHECK (manifest_json->>'identityChecksum' = identity_checksum),
  CONSTRAINT atlas_context_manifest_v2_readbacks_request_check
    CHECK (manifest_json#>>'{v1,requestId}' = request_id),
  CONSTRAINT atlas_context_manifest_v2_readbacks_snapshot_check
    CHECK (manifest_json#>>'{v1,snapshotId}' = snapshot_id)
);

CREATE INDEX IF NOT EXISTS atlas_context_manifest_v2_readbacks_request_idx
  ON public.atlas_context_manifest_v2_readbacks (request_id, created_at DESC);
