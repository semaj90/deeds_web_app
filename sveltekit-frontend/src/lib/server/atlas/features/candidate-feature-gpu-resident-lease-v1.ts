import { createHash } from 'node:crypto';
import { z } from 'zod';

import { artifactAddressSchema } from '../../queue/artifact-work-item-v1.js';
import { candidateFeatureGpuPackV1Schema } from './candidate-feature-gpu-pack-v1.js';

export const CANDIDATE_FEATURE_GPU_RESIDENT_LEASE_SCHEMA =
  'atlas.candidate-feature-gpu-resident-lease.v1' as const;
export const CANDIDATE_FEATURE_GPU_RESIDENT_LEASE_PRODUCER =
  'atlas.candidate-feature-gpu-resident-lease.2026-08-22.v1' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);
const instant = z.string().datetime();

export const candidateFeatureGpuResidentBufferKindSchema = z.enum([
  'FEATURE_VALUES',
  'FEATURE_PRESENCE',
  'VALID_MASK',
  'LANE_MASK_U16',
  'DEGRADED_IDENTITY',
]);

type BufferKind = z.infer<typeof candidateFeatureGpuResidentBufferKindSchema>;

export const candidateFeatureGpuResidentBufferV1Schema = z.object({
  kind: candidateFeatureGpuResidentBufferKindSchema,
  address: artifactAddressSchema.superRefine((value, ctx) => {
    if (value.locator.storage !== 'GPU_RESIDENT') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'FEATURE_GPU_LEASE_BUFFER_NOT_GPU_RESIDENT' });
    }
  }),
  /** FEAT-03D source bytes before any physical staging transform. */
  sourceChecksum: checksum,
  /** Exact resident physical representation copied to the device. */
  residentChecksum: checksum,
}).strict();

export const candidateFeatureGpuResidentLeaseV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_GPU_RESIDENT_LEASE_SCHEMA),
  leaseId: z.string().min(1),
  leaseEpoch: z.number().int().positive(),
  state: z.enum(['ACTIVE', 'RELEASED', 'EXPIRED']),
  deviceId: z.number().int().nonnegative(),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  featureSnapshotChecksum: checksum,
  gpuPackChecksum: checksum,
  logicalRows: z.number().int().nonnegative(),
  physicalRows: z.number().int().nonnegative(),
  featureCount: z.number().int().positive(),
  stagingMode: z.enum(['PAGEABLE_SYNC', 'PINNED_ASYNC']),
  createdAt: instant,
  expiresAt: instant,
  releasedAt: instant.nullable(),
  buffers: z.array(candidateFeatureGpuResidentBufferV1Schema).length(5),
  leaseChecksum: checksum,
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  rawPointerExposed: z.literal(false),
  cudaIpcExported: z.literal(false),
  producerRevision: revision,
}).strict().superRefine((value, ctx) => {
  const kinds = value.buffers.map((buffer) => buffer.kind);
  if (new Set(kinds).size !== 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buffers'], message: 'FEATURE_GPU_LEASE_BUFFER_KIND_DUPLICATE' });
  }
  for (const required of candidateFeatureGpuResidentBufferKindSchema.options) {
    if (!kinds.includes(required)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buffers'], message: `FEATURE_GPU_LEASE_BUFFER_KIND_MISSING:${required}` });
    }
  }
  for (const buffer of value.buffers) {
    if (buffer.address.locator.storage === 'GPU_RESIDENT' && buffer.address.locator.deviceId !== value.deviceId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buffers'], message: 'FEATURE_GPU_LEASE_DEVICE_MISMATCH' });
    }
  }
  const created = Date.parse(value.createdAt);
  const expires = Date.parse(value.expiresAt);
  if (!(expires > created)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'FEATURE_GPU_LEASE_EXPIRY_INVALID' });
  }
  if (value.state === 'ACTIVE' && value.releasedAt !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['releasedAt'], message: 'FEATURE_GPU_LEASE_ACTIVE_HAS_RELEASE_TIME' });
  }
  if (value.state === 'RELEASED' && value.releasedAt === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['releasedAt'], message: 'FEATURE_GPU_LEASE_RELEASE_TIME_REQUIRED' });
  }
});

export type CandidateFeatureGpuResidentLeaseV1 = z.infer<
  typeof candidateFeatureGpuResidentLeaseV1Schema
>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function expectedSourceChecksum(pack: z.infer<typeof candidateFeatureGpuPackV1Schema>, kind: BufferKind): string {
  switch (kind) {
    case 'FEATURE_VALUES': return pack.featureValuesChecksum;
    case 'FEATURE_PRESENCE': return pack.featurePresenceChecksum;
    case 'VALID_MASK': return pack.validMaskChecksum;
    case 'LANE_MASK_U16': return pack.laneMaskChecksum;
    case 'DEGRADED_IDENTITY': return pack.degradedIdentityChecksum;
  }
}

function expectedShape(pack: z.infer<typeof candidateFeatureGpuPackV1Schema>, kind: BufferKind): number[] {
  return kind === 'FEATURE_VALUES' || kind === 'FEATURE_PRESENCE'
    ? [pack.physicalRows, pack.featureCount]
    : [pack.physicalRows];
}

function expectedResidentDtype(kind: BufferKind) {
  switch (kind) {
    case 'FEATURE_VALUES': return 'f32' as const;
    case 'FEATURE_PRESENCE': return 'u8' as const;
    case 'VALID_MASK': return 'u8' as const;
    // The current PyTorch worker stages the logical uint16 mask losslessly as int32.
    case 'LANE_MASK_U16': return 'i32' as const;
    case 'DEGRADED_IDENTITY': return 'u8' as const;
  }
}

function withLeaseChecksum<T extends Omit<CandidateFeatureGpuResidentLeaseV1, 'leaseChecksum'>>(value: T): CandidateFeatureGpuResidentLeaseV1 {
  return candidateFeatureGpuResidentLeaseV1Schema.parse({
    ...value,
    leaseChecksum: sha256(JSON.stringify(value)),
  });
}

export function verifyCandidateFeatureGpuResidentLease(input: {
  pack: z.input<typeof candidateFeatureGpuPackV1Schema>;
  lease: unknown;
  now?: string;
}): CandidateFeatureGpuResidentLeaseV1 {
  const pack = candidateFeatureGpuPackV1Schema.parse(input.pack);
  const lease = candidateFeatureGpuResidentLeaseV1Schema.parse(input.lease);

  if (lease.candidateSnapshotRevision !== pack.candidateSnapshotRevision
      || lease.ordinalMapChecksum !== pack.ordinalMapChecksum
      || lease.featureSnapshotChecksum !== pack.featureSnapshotChecksum
      || lease.gpuPackChecksum !== pack.gpuPackChecksum) {
    throw new Error('FEATURE_GPU_LEASE_SOURCE_LINEAGE_MISMATCH');
  }
  if (lease.logicalRows !== pack.logicalRows
      || lease.physicalRows !== pack.physicalRows
      || lease.featureCount !== pack.featureCount) {
    throw new Error('FEATURE_GPU_LEASE_SOURCE_SHAPE_MISMATCH');
  }

  for (const buffer of lease.buffers) {
    const kind = buffer.kind;
    if (buffer.sourceChecksum !== expectedSourceChecksum(pack, kind)) {
      throw new Error(`FEATURE_GPU_LEASE_SOURCE_CHECKSUM_MISMATCH:${kind}`);
    }
    if (buffer.address.locator.storage !== 'GPU_RESIDENT') {
      throw new Error(`FEATURE_GPU_LEASE_BUFFER_NOT_GPU_RESIDENT:${kind}`);
    }
    if (buffer.address.locator.dtype !== expectedResidentDtype(kind)) {
      throw new Error(`FEATURE_GPU_LEASE_DTYPE_MISMATCH:${kind}`);
    }
    if (JSON.stringify(buffer.address.locator.shape) !== JSON.stringify(expectedShape(pack, kind))) {
      throw new Error(`FEATURE_GPU_LEASE_BUFFER_SHAPE_MISMATCH:${kind}`);
    }
    if (buffer.address.checksum !== buffer.residentChecksum) {
      throw new Error(`FEATURE_GPU_LEASE_ARTIFACT_CHECKSUM_MISMATCH:${kind}`);
    }
  }

  const { leaseChecksum, ...payload } = lease;
  if (leaseChecksum !== sha256(JSON.stringify(payload))) {
    throw new Error('FEATURE_GPU_LEASE_CHECKSUM_MISMATCH');
  }

  const now = Date.parse(input.now ?? new Date().toISOString());
  if (lease.state !== 'ACTIVE') throw new Error(`FEATURE_GPU_LEASE_NOT_ACTIVE:${lease.state}`);
  if (now >= Date.parse(lease.expiresAt)) throw new Error('FEATURE_GPU_LEASE_EXPIRED');
  return lease;
}

export function buildCandidateFeatureGpuResidentLease(input: {
  pack: z.input<typeof candidateFeatureGpuPackV1Schema>;
  leaseId: string;
  leaseEpoch: number;
  deviceId: number;
  stagingMode: 'PAGEABLE_SYNC' | 'PINNED_ASYNC';
  createdAt: string;
  expiresAt: string;
  bufferIds: Record<BufferKind, string>;
  residentChecksums: Record<BufferKind, string>;
}): CandidateFeatureGpuResidentLeaseV1 {
  const pack = candidateFeatureGpuPackV1Schema.parse(input.pack);
  const buffers = candidateFeatureGpuResidentBufferKindSchema.options.map((kind) => {
    const sourceChecksum = expectedSourceChecksum(pack, kind);
    const residentChecksum = checksum.parse(input.residentChecksums[kind]);
    return {
      kind,
      sourceChecksum,
      residentChecksum,
      address: {
        schema: 'atlas.artifact-address.v1' as const,
        artifactId: `${input.leaseId}:${kind}`,
        artifactHash: residentChecksum,
        schemaId: `atlas.candidate-feature-gpu-buffer.${kind.toLowerCase()}.v1`,
        checksum: residentChecksum,
        revisionSetHash: pack.gpuPackChecksum,
        revisions: {
          candidateSnapshotRevision: pack.candidateSnapshotRevision,
          featureSnapshotChecksum: pack.featureSnapshotChecksum,
          ordinalMapChecksum: pack.ordinalMapChecksum,
          gpuPackChecksum: pack.gpuPackChecksum,
          sourceChecksum,
          leaseEpoch: String(input.leaseEpoch),
        },
        locator: {
          storage: 'GPU_RESIDENT' as const,
          deviceId: input.deviceId,
          bufferId: input.bufferIds[kind],
          dtype: expectedResidentDtype(kind),
          shape: expectedShape(pack, kind),
        },
      },
    };
  });

  return withLeaseChecksum({
    schema: CANDIDATE_FEATURE_GPU_RESIDENT_LEASE_SCHEMA,
    leaseId: input.leaseId,
    leaseEpoch: input.leaseEpoch,
    state: 'ACTIVE',
    deviceId: input.deviceId,
    candidateSnapshotRevision: pack.candidateSnapshotRevision,
    ordinalMapChecksum: pack.ordinalMapChecksum,
    featureSnapshotChecksum: pack.featureSnapshotChecksum,
    gpuPackChecksum: pack.gpuPackChecksum,
    logicalRows: pack.logicalRows,
    physicalRows: pack.physicalRows,
    featureCount: pack.featureCount,
    stagingMode: input.stagingMode,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    releasedAt: null,
    buffers,
    identityAuthority: false,
    canonicalOwnerChanged: false,
    rawPointerExposed: false,
    cudaIpcExported: false,
    producerRevision: CANDIDATE_FEATURE_GPU_RESIDENT_LEASE_PRODUCER,
  });
}

export function releaseCandidateFeatureGpuResidentLease(input: {
  lease: unknown;
  releasedAt: string;
}): CandidateFeatureGpuResidentLeaseV1 {
  const lease = candidateFeatureGpuResidentLeaseV1Schema.parse(input.lease);
  if (lease.state !== 'ACTIVE') {
    throw new Error(`FEATURE_GPU_LEASE_RELEASE_REQUIRES_ACTIVE:${lease.state}`);
  }
  const releasedAt = instant.parse(input.releasedAt);
  if (Date.parse(releasedAt) < Date.parse(lease.createdAt)) {
    throw new Error('FEATURE_GPU_LEASE_RELEASE_BEFORE_CREATE');
  }
  const { leaseChecksum: _oldChecksum, ...payload } = lease;
  return withLeaseChecksum({ ...payload, state: 'RELEASED', releasedAt });
}
