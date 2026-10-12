import {
  buildContextManifestV2,
  ContextManifestV2Schema,
  type ContextManifestV2,
} from './context-manifest-v2.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

const SHA256 = /^[a-f0-9]{64}$/;

export interface ContextManifestV2ReadbackRowV1 {
  identity_checksum: string;
  request_id: string;
  snapshot_id: string;
  manifest_json: unknown;
  manifest_payload_checksum: string;
}

export type ContextManifestV2ReadbackResultV1 = {
  schema: 'atlas.context-manifest-v2-readback.v1';
  status: 'READBACK_MATCH_NOT_ADMITTED' | 'BLOCKED';
  reason: string | null;
  manifest: ContextManifestV2 | null;
  identityChecksum: string | null;
  payloadChecksum: string | null;
  canonicalAuthority: false;
  writesPerformed: false;
};

export const CONTEXT_MANIFEST_V2_READONLY_SQL_V1 = `
SELECT identity_checksum, request_id, snapshot_id, manifest_json, manifest_payload_checksum
  FROM public.atlas_context_manifest_v2_readbacks
 WHERE identity_checksum = $1
 LIMIT 2`;

function blocked(reason: string): ContextManifestV2ReadbackResultV1 {
  return {
    schema: 'atlas.context-manifest-v2-readback.v1',
    status: 'BLOCKED',
    reason,
    manifest: null,
    identityChecksum: null,
    payloadChecksum: null,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export function verifyContextManifestV2ReadbackRowV1(
  row: ContextManifestV2ReadbackRowV1 | null,
  expectedIdentityChecksum: string,
): ContextManifestV2ReadbackResultV1 {
  if (!SHA256.test(expectedIdentityChecksum)) return blocked('IDENTITY_CHECKSUM_INVALID');
  if (!row) return blocked('MANIFEST_READBACK_NOT_FOUND');
  if (row.identity_checksum !== expectedIdentityChecksum) return blocked('IDENTITY_CHECKSUM_MISMATCH');
  if (!SHA256.test(row.manifest_payload_checksum)) return blocked('PAYLOAD_CHECKSUM_INVALID');

  const parsed = ContextManifestV2Schema.safeParse(row.manifest_json);
  if (!parsed.success) return blocked('MANIFEST_SCHEMA_INVALID');
  const manifest = parsed.data;
  if (manifest.identityChecksum !== row.identity_checksum) return blocked('MANIFEST_IDENTITY_MISMATCH');
  if (manifest.v1.requestId !== row.request_id || manifest.v1.snapshotId !== row.snapshot_id) {
    return blocked('MANIFEST_ROW_BINDING_MISMATCH');
  }

  try {
    const rebuilt = buildContextManifestV2(manifest.v1, manifest.identityInput);
    if (rebuilt.identityChecksum !== manifest.identityChecksum) return blocked('IDENTITY_RECOMPUTE_MISMATCH');
    const payloadChecksum = canonicalSha256V1(manifest);
    if (payloadChecksum !== row.manifest_payload_checksum) return blocked('PAYLOAD_RECOMPUTE_MISMATCH');
    return {
      schema: 'atlas.context-manifest-v2-readback.v1',
      status: 'READBACK_MATCH_NOT_ADMITTED',
      reason: null,
      manifest,
      identityChecksum: row.identity_checksum,
      payloadChecksum,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  } catch {
    return blocked('MANIFEST_RECOMPUTE_FAILED');
  }
}
