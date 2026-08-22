import { createHash } from 'node:crypto';
import { z } from 'zod';

import { artifactAddressSchema, type ArtifactAddressV1 } from '../../queue/artifact-work-item-v1.js';
import { CANDIDATE_SCALAR_FEATURES } from './candidate-feature-columnar-v1.js';
import {
  candidateFeatureGpuPackV1Schema,
  type CandidateFeatureGpuPackV1,
} from './candidate-feature-gpu-pack-v1.js';

export const CANDIDATE_FEATURE_GPU_RESIDENCY_SCHEMA = 'atlas.candidate-feature-gpu-residency-lease.v1' as const;
export const CANDIDATE_FEATURE_GPU_RESIDENCY_OBSERVATION_SCHEMA = 'atlas.candidate-feature-gpu-residency-observation.v1' as const;
export const CANDIDATE_FEATURE_GPU_RELEASE_SCHEMA = 'atlas.candidate-feature-gpu-release-receipt.v1' as const;

export const GPU_CANDIDATE_BUFFER_ROLES = Object.freeze([
  'feature_values',
  'feature_presence',
  'valid_mask',
  'lane_mask',
  'degraded_identity',
] as const);

type GpuCandidateBufferRole = typeof GPU_CANDIDATE_BUFFER_ROLES[number];

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);
const bufferRoleSchema = z.enum(GPU_CANDIDATE_BUFFER_ROLES);

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

export const candidateFeatureGpuResidentBufferObservationSchema = z.object({
  role: bufferRoleSchema,
  bufferId: z.string().min(1),
  dtype: z.enum(['f32', 'u8', 'i32']),
  shape: z.array(z.number().int().positive()).min(1).max(2),
  sourceChecksum: checksum,
  materializedChecksum: checksum,
  deviceAllocationObserved: z.literal(true),
  readbackVerified: z.literal(true),
}).strict();
export type CandidateFeatureGpuResidentBufferObservationV1 = z.infer<typeof candidateFeatureGpuResidentBufferObservationSchema>;

export const candidateFeatureGpuResidencyObservationSchema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_GPU_RESIDENCY_OBSERVATION_SCHEMA),
  leaseId: z.string().min(1),
  deviceId: z.number().int().nonnegative(),
  deviceName: z.string().min(1),
  sourceGpuPackChecksum: checksum,
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  featureSnapshotChecksum: checksum,
  columnarChecksum: checksum,
  logicalRows: z.number().int().nonnegative(),
  physicalRows: z.number().int().nonnegative(),
  featureCount: z.literal(CANDIDATE_SCALAR_FEATURES.length),
  hostStagingMode: z.enum(['PAGEABLE_SYNC', 'PINNED_ASYNC']),
  gpuExecutionObserved: z.literal(true),
  ipcExported: z.literal(false),
  buffers: z.array(candidateFeatureGpuResidentBufferObservationSchema).length(GPU_CANDIDATE_BUFFER_ROLES.length),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  producerRevision: revision,
  observationChecksum: checksum,
}).strict().superRefine((value, ctx) => {
  const roles = value.buffers.map((buffer) => buffer.role);
  if (new Set(roles).size !== GPU_CANDIDATE_BUFFER_ROLES.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buffers'], message: 'GPU_RESIDENCY_BUFFER_ROLE_DUPLICATE_OR_MISSING' });
  }
  if (Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'GPU_RESIDENCY_EXPIRY_NOT_AFTER_ISSUE' });
  }
  const { observationChecksum, ...body } = value;
  if (sha256(canonicalJson(body)) !== observationChecksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['observationChecksum'], message: 'GPU_RESIDENCY_OBSERVATION_CHECKSUM_MISMATCH' });
  }
});
export type CandidateFeatureGpuResidencyObservationV1 = z.infer<typeof candidateFeatureGpuResidencyObservationSchema>;

export const candidateFeatureGpuResidentArtifactSchema = z.object({
  role: bufferRoleSchema,
  sourceChecksum: checksum,
  address: artifactAddressSchema,
}).strict();
export type CandidateFeatureGpuResidentArtifactV1 = z.infer<typeof candidateFeatureGpuResidentArtifactSchema>;

export const candidateFeatureGpuResidencyLeaseV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_GPU_RESIDENCY_SCHEMA),
  leaseId: z.string().min(1),
  leaseEpoch: z.number().int().positive(),
  sourceGpuPackChecksum: checksum,
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  featureSnapshotChecksum: checksum,
  columnarChecksum: checksum,
  workspaceRevision: revision,
  featureRevision: revision,
  logicalRows: z.number().int().nonnegative(),
  physicalRows: z.number().int().nonnegative(),
  featureCount: z.literal(CANDIDATE_SCALAR_FEATURES.length),
  deviceId: z.number().int().nonnegative(),
  deviceName: z.string().min(1),
  hostStagingMode: z.enum(['PAGEABLE_SYNC', 'PINNED_ASYNC']),
  ownerProcessResident: z.literal(true),
  cudaIpcExported: z.literal(false),
  artifacts: z.array(candidateFeatureGpuResidentArtifactSchema).length(GPU_CANDIDATE_BUFFER_ROLES.length),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  state: z.literal('ACTIVE'),
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  producerRevision: revision,
  leaseChecksum: checksum,
}).strict().superRefine((value, ctx) => {
  const roles = value.artifacts.map((artifact) => artifact.role);
  if (new Set(roles).size !== GPU_CANDIDATE_BUFFER_ROLES.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts'], message: 'GPU_RESIDENCY_ARTIFACT_ROLE_DUPLICATE_OR_MISSING' });
  }
  for (const artifact of value.artifacts) {
    if (artifact.address.locator.storage !== 'GPU_RESIDENT') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts'], message: `GPU_RESIDENCY_NON_GPU_ADDRESS:${artifact.role}` });
    } else if (artifact.address.locator.deviceId !== value.deviceId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts'], message: `GPU_RESIDENCY_DEVICE_MISMATCH:${artifact.role}` });
    }
  }
  const { leaseChecksum, ...body } = value;
  if (sha256(canonicalJson(body)) !== leaseChecksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['leaseChecksum'], message: 'GPU_RESIDENCY_LEASE_CHECKSUM_MISMATCH' });
  }
});
export type CandidateFeatureGpuResidencyLeaseV1 = z.infer<typeof candidateFeatureGpuResidencyLeaseV1Schema>;

export const candidateFeatureGpuReleaseReceiptV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_GPU_RELEASE_SCHEMA),
  leaseId: z.string().min(1),
  leaseEpoch: z.number().int().positive(),
  leaseChecksum: checksum,
  state: z.literal('RELEASED'),
  releasedAt: z.string().datetime(),
  bufferIds: z.array(z.string().min(1)).length(GPU_CANDIDATE_BUFFER_ROLES.length),
  releaseChecksum: checksum,
  identityAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const { releaseChecksum, schema: _schema, identityAuthority: _authority, ...body } = value;
  if (sha256(canonicalJson(body)) !== releaseChecksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['releaseChecksum'], message: 'GPU_RESIDENCY_RELEASE_CHECKSUM_MISMATCH' });
  }
});
export type CandidateFeatureGpuReleaseReceiptV1 = z.infer<typeof candidateFeatureGpuReleaseReceiptV1Schema>;

function expectedSourceChecksum(pack: CandidateFeatureGpuPackV1, role: GpuCandidateBufferRole): string {
  switch (role) {
    case 'feature_values': return pack.featureValuesChecksum;
    case 'feature_presence': return pack.featurePresenceChecksum;
    case 'valid_mask': return pack.validMaskChecksum;
    case 'lane_mask': return pack.laneMaskChecksum;
    case 'degraded_identity': return pack.degradedIdentityChecksum;
  }
}

function expectedShape(pack: CandidateFeatureGpuPackV1, role: GpuCandidateBufferRole): number[] {
  return role === 'feature_values' || role === 'feature_presence'
    ? [pack.physicalRows, pack.featureCount]
    : [pack.physicalRows];
}

function expectedDtype(role: GpuCandidateBufferRole): 'f32' | 'u8' | 'i32' {
  if (role === 'feature_values') return 'f32';
  if (role === 'lane_mask') return 'i32';
  return 'u8';
}

export function buildCandidateFeatureGpuResidencyLease(input: {
  pack: unknown;
  observation: unknown;
  leaseEpoch?: number;
  producerRevision: string;
}): CandidateFeatureGpuResidencyLeaseV1 {
  const pack = candidateFeatureGpuPackV1Schema.parse(input.pack);
  const observation = candidateFeatureGpuResidencyObservationSchema.parse(input.observation);

  const lineagePairs: Array<[string, unknown, unknown]> = [
    ['sourceGpuPackChecksum', observation.sourceGpuPackChecksum, pack.gpuPackChecksum],
    ['candidateSnapshotRevision', observation.candidateSnapshotRevision, pack.candidateSnapshotRevision],
    ['ordinalMapChecksum', observation.ordinalMapChecksum, pack.ordinalMapChecksum],
    ['featureSnapshotChecksum', observation.featureSnapshotChecksum, pack.featureSnapshotChecksum],
    ['columnarChecksum', observation.columnarChecksum, pack.columnarChecksum],
    ['logicalRows', observation.logicalRows, pack.logicalRows],
    ['physicalRows', observation.physicalRows, pack.physicalRows],
    ['featureCount', observation.featureCount, pack.featureCount],
  ];
  for (const [field, actual, expected] of lineagePairs) {
    if (actual !== expected) throw new Error(`GPU_RESIDENCY_PACK_LINEAGE_MISMATCH:${field}`);
  }

  const revisionSet = {
    candidateSnapshotRevision: pack.candidateSnapshotRevision,
    ordinalMapChecksum: pack.ordinalMapChecksum,
    featureSnapshotChecksum: pack.featureSnapshotChecksum,
    columnarChecksum: pack.columnarChecksum,
    gpuPackChecksum: pack.gpuPackChecksum,
    workspaceRevision: pack.workspaceRevision,
    featureRevision: pack.featureRevision,
  };
  const revisionSetHash = sha256(canonicalJson(revisionSet));

  const artifacts = observation.buffers
    .map((buffer) => {
      const expectedSource = expectedSourceChecksum(pack, buffer.role);
      if (buffer.sourceChecksum !== expectedSource) throw new Error(`GPU_RESIDENCY_SOURCE_CHECKSUM_MISMATCH:${buffer.role}`);
      if (buffer.dtype !== expectedDtype(buffer.role)) throw new Error(`GPU_RESIDENCY_DTYPE_MISMATCH:${buffer.role}`);
      if (JSON.stringify(buffer.shape) !== JSON.stringify(expectedShape(pack, buffer.role))) {
        throw new Error(`GPU_RESIDENCY_SHAPE_MISMATCH:${buffer.role}`);
      }
      const address: ArtifactAddressV1 = artifactAddressSchema.parse({
        schema: 'atlas.artifact-address.v1',
        artifactId: `gpu:${observation.leaseId}:${buffer.role}`,
        artifactHash: buffer.materializedChecksum,
        schemaId: `atlas.candidate-feature-gpu-buffer.${buffer.role}.v1`,
        checksum: buffer.materializedChecksum,
        revisionSetHash,
        revisions: revisionSet,
        locator: {
          storage: 'GPU_RESIDENT',
          deviceId: observation.deviceId,
          bufferId: buffer.bufferId,
          dtype: buffer.dtype,
          shape: buffer.shape,
        },
      });
      return { role: buffer.role, sourceChecksum: buffer.sourceChecksum, address };
    })
    .sort((left, right) => GPU_CANDIDATE_BUFFER_ROLES.indexOf(left.role) - GPU_CANDIDATE_BUFFER_ROLES.indexOf(right.role));

  const body = {
    schema: CANDIDATE_FEATURE_GPU_RESIDENCY_SCHEMA,
    leaseId: observation.leaseId,
    leaseEpoch: input.leaseEpoch ?? 1,
    sourceGpuPackChecksum: pack.gpuPackChecksum,
    candidateSnapshotRevision: pack.candidateSnapshotRevision,
    ordinalMapChecksum: pack.ordinalMapChecksum,
    featureSnapshotChecksum: pack.featureSnapshotChecksum,
    columnarChecksum: pack.columnarChecksum,
    workspaceRevision: pack.workspaceRevision,
    featureRevision: pack.featureRevision,
    logicalRows: pack.logicalRows,
    physicalRows: pack.physicalRows,
    featureCount: pack.featureCount,
    deviceId: observation.deviceId,
    deviceName: observation.deviceName,
    hostStagingMode: observation.hostStagingMode,
    ownerProcessResident: true as const,
    cudaIpcExported: false as const,
    artifacts,
    issuedAt: observation.issuedAt,
    expiresAt: observation.expiresAt,
    state: 'ACTIVE' as const,
    identityAuthority: false as const,
    canonicalOwnerChanged: false as const,
    producerRevision: input.producerRevision,
  };
  return candidateFeatureGpuResidencyLeaseV1Schema.parse({
    ...body,
    leaseChecksum: sha256(canonicalJson(body)),
  });
}

export function verifyGpuResidentArtifactLease(input: {
  lease: unknown;
  address: unknown;
  role: GpuCandidateBufferRole;
  now?: Date;
}): { status: 'PROVEN' | 'REJECTED'; reason: string | null } {
  const lease = candidateFeatureGpuResidencyLeaseV1Schema.parse(input.lease);
  const address = artifactAddressSchema.parse(input.address);
  const expected = lease.artifacts.find((artifact) => artifact.role === input.role);
  if (!expected) return { status: 'REJECTED', reason: 'GPU_RESIDENCY_ROLE_NOT_IN_LEASE' };
  if ((input.now ?? new Date()).getTime() >= Date.parse(lease.expiresAt)) return { status: 'REJECTED', reason: 'GPU_RESIDENCY_LEASE_EXPIRED' };
  if (address.artifactId !== expected.address.artifactId || address.checksum !== expected.address.checksum) {
    return { status: 'REJECTED', reason: 'GPU_RESIDENCY_ADDRESS_MISMATCH' };
  }
  if (address.locator.storage !== 'GPU_RESIDENT') return { status: 'REJECTED', reason: 'GPU_RESIDENCY_STORAGE_MISMATCH' };
  if (expected.address.locator.storage !== 'GPU_RESIDENT') return { status: 'REJECTED', reason: 'GPU_RESIDENCY_LEASE_ADDRESS_INVALID' };
  if (address.locator.bufferId !== expected.address.locator.bufferId) return { status: 'REJECTED', reason: 'GPU_RESIDENCY_BUFFER_ID_MISMATCH' };
  return { status: 'PROVEN', reason: null };
}

export function buildCandidateFeatureGpuReleaseReceipt(input: {
  lease: unknown;
  releasedAt: string;
}): CandidateFeatureGpuReleaseReceiptV1 {
  const lease = candidateFeatureGpuResidencyLeaseV1Schema.parse(input.lease);
  const bufferIds = lease.artifacts.map((artifact) => {
    if (artifact.address.locator.storage !== 'GPU_RESIDENT') throw new Error('GPU_RESIDENCY_RELEASE_NON_GPU_ARTIFACT');
    return artifact.address.locator.bufferId;
  }).sort();
  const body = {
    leaseId: lease.leaseId,
    leaseEpoch: lease.leaseEpoch,
    leaseChecksum: lease.leaseChecksum,
    state: 'RELEASED' as const,
    releasedAt: input.releasedAt,
    bufferIds,
  };
  return candidateFeatureGpuReleaseReceiptV1Schema.parse({
    schema: CANDIDATE_FEATURE_GPU_RELEASE_SCHEMA,
    ...body,
    releaseChecksum: sha256(canonicalJson(body)),
    identityAuthority: false,
  });
}
