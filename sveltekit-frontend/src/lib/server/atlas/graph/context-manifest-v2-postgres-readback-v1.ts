import { pool } from '$lib/server/db/client.js';
import {
  buildContextManifestV2,
  ContextManifestV2Schema,
  type ContextManifestV2,
} from './context-manifest-v2.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  CONTEXT_MANIFEST_V2_READONLY_SQL_V1,
  verifyContextManifestV2ReadbackRowV1,
  type ContextManifestV2ReadbackResultV1,
  type ContextManifestV2ReadbackRowV1,
} from './context-manifest-v2-readback-contract-v1.js';

export { verifyContextManifestV2ReadbackRowV1 } from './context-manifest-v2-readback-contract-v1.js';
export type { ContextManifestV2ReadbackResultV1, ContextManifestV2ReadbackRowV1 } from './context-manifest-v2-readback-contract-v1.js';

const SHA256 = /^[a-f0-9]{64}$/;

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

export async function readContextManifestV2FromPostgresV1(
  identityChecksum: string,
): Promise<ContextManifestV2ReadbackResultV1> {
  if (!SHA256.test(identityChecksum)) return blocked('IDENTITY_CHECKSUM_INVALID');
  try {
    const result = await pool.query<ContextManifestV2ReadbackRowV1>(
      CONTEXT_MANIFEST_V2_READONLY_SQL_V1,
      [identityChecksum],
    );
    if (result.rows.length > 1) return blocked('IDENTITY_CHECKSUM_AMBIGUOUS');
    return verifyContextManifestV2ReadbackRowV1(result.rows[0] ?? null, identityChecksum);
  } catch {
    return blocked('MANIFEST_READBACK_OWNER_UNAVAILABLE');
  }
}

export async function persistContextManifestV2ReadbackV1(
  value: unknown,
): Promise<ContextManifestV2ReadbackResultV1> {
  const parsed = ContextManifestV2Schema.safeParse(value);
  if (!parsed.success) return blocked('MANIFEST_SCHEMA_INVALID');
  const manifest = parsed.data;
  try {
    const rebuilt = buildContextManifestV2(manifest.v1, manifest.identityInput);
    if (rebuilt.identityChecksum !== manifest.identityChecksum) return blocked('IDENTITY_RECOMPUTE_MISMATCH');
    const payloadChecksum = canonicalSha256V1(manifest);
    await pool.query(
      `INSERT INTO public.atlas_context_manifest_v2_readbacks (
         identity_checksum, request_id, snapshot_id, manifest_json, manifest_payload_checksum
       ) VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (identity_checksum) DO NOTHING`,
      [manifest.identityChecksum, manifest.v1.requestId, manifest.v1.snapshotId, JSON.stringify(manifest), payloadChecksum],
    );
    return await readContextManifestV2FromPostgresV1(manifest.identityChecksum);
  } catch {
    return blocked('MANIFEST_PERSISTENCE_OWNER_UNAVAILABLE');
  }
}
