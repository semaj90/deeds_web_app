import crypto from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';

export const BITFROST_LATENT256_DIM = 256;
export const BITFROST_LATENT256_TTL_SECONDS = 60 * 60;

export interface BitFrostCandidateRecordV1 {
  candidateId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  representationRevision: string;
  checkpointRevision: string;
  latent256: readonly number[];
  somCell?: string | null;
  kmeansCluster?: number | null;
  domainTags?: readonly string[];
  conceptTags?: readonly string[];
  aceCardChecksum?: string | null;
  contextManifestChecksum?: string | null;
}

function required(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} is required`);
  return value;
}

export function encodeF32LE(values: readonly number[]): Buffer {
  if (values.length !== BITFROST_LATENT256_DIM) {
    throw new Error(`latent_256 must contain ${BITFROST_LATENT256_DIM} values`);
  }
  const buffer = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new Error(`latent_256[${index}] must be finite`);
    buffer.writeFloatLE(value, index * 4);
  });
  return buffer;
}

export function decodeF32LE(value: Uint8Array): number[] {
  if (value.byteLength !== BITFROST_LATENT256_DIM * 4) {
    throw new Error(`latent_256 binary payload must contain ${BITFROST_LATENT256_DIM * 4} bytes`);
  }
  const view = Buffer.from(value);
  return Array.from({ length: BITFROST_LATENT256_DIM }, (_, index) => view.readFloatLE(index * 4));
}

export function bitFrostCandidateKeyV1(record: Pick<
  BitFrostCandidateRecordV1,
  'candidateId' | 'candidateSnapshotRevision' | 'representationRevision' | 'checkpointRevision'
>): string {
  const identity = JSON.stringify({
    candidateId: required(record.candidateId, 'candidateId'),
    candidateSnapshotRevision: required(record.candidateSnapshotRevision, 'candidateSnapshotRevision'),
    representationRevision: required(record.representationRevision, 'representationRevision'),
    checkpointRevision: required(record.checkpointRevision, 'checkpointRevision'),
  });
  return `bitfrost:candidate:v1:${crypto.createHash('sha256').update(identity).digest('hex')}`;
}

export function bitFrostCandidateRecordFieldsV1(record: BitFrostCandidateRecordV1): Record<string, string | Buffer> {
  const fields: Record<string, string | Buffer> = {
    candidate_id: required(record.candidateId, 'candidateId'),
    packet_key: required(record.packetKey, 'packetKey'),
    source_ref: required(record.sourceRef, 'sourceRef'),
    source_revision: required(record.sourceRevision, 'sourceRevision'),
    workspace_revision: required(record.workspaceRevision, 'workspaceRevision'),
    candidate_snapshot_revision: required(record.candidateSnapshotRevision, 'candidateSnapshotRevision'),
    representation_revision: required(record.representationRevision, 'representationRevision'),
    checkpoint_revision: required(record.checkpointRevision, 'checkpointRevision'),
    latent_256: encodeF32LE(record.latent256),
    som_cell: record.somCell ?? '',
    kmeans_cluster: record.kmeansCluster == null ? '' : String(record.kmeansCluster),
    domain_tags: JSON.stringify(record.domainTags ?? []),
    concept_tags: JSON.stringify(record.conceptTags ?? []),
    ace_card_checksum: record.aceCardChecksum ?? '',
    context_manifest_checksum: record.contextManifestChecksum ?? '',
    canonical_authority: 'false',
  };
  return fields;
}

export async function warmBitFrostCandidateV1(record: BitFrostCandidateRecordV1): Promise<string> {
  const redis = getRedis();
  const key = bitFrostCandidateKeyV1(record);
  await redis.hset(key, bitFrostCandidateRecordFieldsV1(record));
  await redis.expire(key, BITFROST_LATENT256_TTL_SECONDS);
  return key;
}

export async function readBitFrostCandidateLatent256V1(
  recordIdentity: Pick<BitFrostCandidateRecordV1, 'candidateId' | 'candidateSnapshotRevision' | 'representationRevision' | 'checkpointRevision'>,
): Promise<number[] | null> {
  const redis = getRedis();
  const value = await redis.hgetBuffer(bitFrostCandidateKeyV1(recordIdentity), 'latent_256');
  if (!value) return null;
  try {
    return decodeF32LE(value);
  } catch {
    return null;
  }
}
