import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateFeatureGpuResidencyLeaseV1Schema,
  type CandidateFeatureGpuResidencyLeaseV1,
  verifyGpuResidentArtifactLease,
} from './candidate-feature-gpu-residency-v1.js';

export const CANDIDATE_FEATURE_GPU_BATCH_REQUEST_SCHEMA = 'atlas.candidate-feature-gpu-batch-request.v1' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);

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

export const candidateFeatureGpuBatchBufferRefSchema = z.object({
  role: z.enum(['feature_values', 'feature_presence', 'valid_mask', 'lane_mask', 'degraded_identity']),
  artifactId: z.string().min(1),
  bufferId: z.string().min(1),
  checksum,
  deviceId: z.number().int().nonnegative(),
}).strict();

export const candidateFeatureGpuBatchRequestV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_GPU_BATCH_REQUEST_SCHEMA),
  actionId: z.string().min(1),
  operation: z.enum(['GATHER', 'RANK']),
  leaseId: z.string().min(1),
  leaseEpoch: z.number().int().positive(),
  leaseChecksum: checksum,
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  featureSnapshotChecksum: checksum,
  workspaceRevision: revision,
  featureRevision: revision,
  candidateOrdinals: z.array(z.number().int().nonnegative()).min(1),
  topK: z.number().int().positive(),
  buffers: z.array(candidateFeatureGpuBatchBufferRefSchema).length(5),
  deviceId: z.number().int().nonnegative(),
  requestCreatedAt: z.string().datetime(),
  deadlineAt: z.string().datetime().nullable(),
  producerRevision: revision,
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  requestChecksum: checksum,
}).strict().superRefine((value, ctx) => {
  if (new Set(value.candidateOrdinals).size !== value.candidateOrdinals.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidateOrdinals'], message: 'GPU_BATCH_DUPLICATE_CANDIDATE_ORDINAL' });
  }
  if (value.topK > value.candidateOrdinals.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['topK'], message: 'GPU_BATCH_TOP_K_EXCEEDS_CANDIDATES' });
  }
  if (value.deadlineAt !== null && Date.parse(value.deadlineAt) <= Date.parse(value.requestCreatedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deadlineAt'], message: 'GPU_BATCH_DEADLINE_NOT_AFTER_CREATION' });
  }
  if (new Set(value.buffers.map((buffer) => buffer.role)).size !== 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buffers'], message: 'GPU_BATCH_BUFFER_ROLE_DUPLICATE_OR_MISSING' });
  }
});

export type CandidateFeatureGpuBatchRequestV1 = z.infer<typeof candidateFeatureGpuBatchRequestV1Schema>;

export function buildCandidateFeatureGpuBatchRequest(input: {
  actionId: string;
  operation?: 'GATHER' | 'RANK';
  lease: z.input<typeof candidateFeatureGpuResidencyLeaseV1Schema>;
  candidateOrdinals: readonly number[];
  topK: number;
  now?: Date;
  deadlineAt?: string | null;
  producerRevision: string;
}): CandidateFeatureGpuBatchRequestV1 {
  const lease: CandidateFeatureGpuResidencyLeaseV1 = candidateFeatureGpuResidencyLeaseV1Schema.parse(input.lease);
  const now = input.now ?? new Date();
  if (Date.parse(lease.expiresAt) <= now.getTime()) {
    throw new Error('GPU_BATCH_RESIDENCY_LEASE_EXPIRED');
  }
  if (lease.state !== 'ACTIVE') {
    throw new Error('GPU_BATCH_RESIDENCY_LEASE_NOT_ACTIVE');
  }

  const candidateOrdinals = [...input.candidateOrdinals];
  if (candidateOrdinals.some((ordinal) => ordinal >= lease.logicalRows)) {
    throw new Error('GPU_BATCH_CANDIDATE_ORDINAL_OUT_OF_RANGE');
  }

  const buffers = lease.artifacts.map((artifact) => {
    const verified = verifyGpuResidentArtifactLease({
      lease,
      address: artifact.address,
      role: artifact.role,
      now,
    });
    if (verified.status !== 'PROVEN') {
      throw new Error(`GPU_BATCH_BUFFER_LEASE_REJECTED:${artifact.role}:${verified.reason}`);
    }
    if (artifact.address.locator.storage !== 'GPU_RESIDENT') {
      throw new Error(`GPU_BATCH_BUFFER_NOT_GPU_RESIDENT:${artifact.role}`);
    }
    return {
      role: artifact.role,
      artifactId: artifact.address.artifactId,
      bufferId: artifact.address.locator.bufferId,
      checksum: artifact.address.checksum,
      deviceId: artifact.address.locator.deviceId,
    };
  });

  const body = {
    schema: CANDIDATE_FEATURE_GPU_BATCH_REQUEST_SCHEMA,
    actionId: input.actionId,
    operation: input.operation ?? 'GATHER' as const,
    leaseId: lease.leaseId,
    leaseEpoch: lease.leaseEpoch,
    leaseChecksum: lease.leaseChecksum,
    candidateSnapshotRevision: lease.candidateSnapshotRevision,
    ordinalMapChecksum: lease.ordinalMapChecksum,
    featureSnapshotChecksum: lease.featureSnapshotChecksum,
    workspaceRevision: lease.workspaceRevision,
    featureRevision: lease.featureRevision,
    candidateOrdinals,
    topK: input.topK,
    buffers,
    deviceId: lease.deviceId,
    requestCreatedAt: now.toISOString(),
    deadlineAt: input.deadlineAt ?? null,
    producerRevision: input.producerRevision,
    identityAuthority: false as const,
    canonicalOwnerChanged: false as const,
  };

  return candidateFeatureGpuBatchRequestV1Schema.parse({
    ...body,
    requestChecksum: sha256(canonicalJson(body)),
  });
}

export function verifyCandidateFeatureGpuBatchRequest(input: {
  request: z.input<typeof candidateFeatureGpuBatchRequestV1Schema>;
  lease: z.input<typeof candidateFeatureGpuResidencyLeaseV1Schema>;
  now?: Date;
}): { status: 'PROVEN' | 'REJECTED'; reason: string | null } {
  const request = candidateFeatureGpuBatchRequestV1Schema.parse(input.request);
  const lease = candidateFeatureGpuResidencyLeaseV1Schema.parse(input.lease);
  const now = input.now ?? new Date();

  if (request.leaseId !== lease.leaseId || request.leaseEpoch !== lease.leaseEpoch || request.leaseChecksum !== lease.leaseChecksum) {
    return { status: 'REJECTED', reason: 'GPU_BATCH_LEASE_IDENTITY_MISMATCH' };
  }
  if (Date.parse(lease.expiresAt) <= now.getTime()) {
    return { status: 'REJECTED', reason: 'GPU_BATCH_RESIDENCY_LEASE_EXPIRED' };
  }
  if (request.deviceId !== lease.deviceId) {
    return { status: 'REJECTED', reason: 'GPU_BATCH_DEVICE_MISMATCH' };
  }
  const revisionPairs: Array<[string, string, string]> = [
    ['candidateSnapshotRevision', request.candidateSnapshotRevision, lease.candidateSnapshotRevision],
    ['ordinalMapChecksum', request.ordinalMapChecksum, lease.ordinalMapChecksum],
    ['featureSnapshotChecksum', request.featureSnapshotChecksum, lease.featureSnapshotChecksum],
    ['workspaceRevision', request.workspaceRevision, lease.workspaceRevision],
    ['featureRevision', request.featureRevision, lease.featureRevision],
  ];
  for (const [field, actual, expected] of revisionPairs) {
    if (actual !== expected) return { status: 'REJECTED', reason: `GPU_BATCH_REVISION_MISMATCH:${field}` };
  }
  if (request.candidateOrdinals.some((ordinal) => ordinal >= lease.logicalRows)) {
    return { status: 'REJECTED', reason: 'GPU_BATCH_CANDIDATE_ORDINAL_OUT_OF_RANGE' };
  }

  const leaseByRole = new Map(lease.artifacts.map((artifact) => [artifact.role, artifact]));
  for (const buffer of request.buffers) {
    const expected = leaseByRole.get(buffer.role);
    if (!expected || expected.address.locator.storage !== 'GPU_RESIDENT') {
      return { status: 'REJECTED', reason: `GPU_BATCH_BUFFER_ROLE_NOT_IN_LEASE:${buffer.role}` };
    }
    if (
      buffer.artifactId !== expected.address.artifactId
      || buffer.bufferId !== expected.address.locator.bufferId
      || buffer.checksum !== expected.address.checksum
      || buffer.deviceId !== expected.address.locator.deviceId
    ) {
      return { status: 'REJECTED', reason: `GPU_BATCH_BUFFER_SUBSTITUTION:${buffer.role}` };
    }
  }

  const { requestChecksum: _checksum, ...body } = request;
  if (sha256(canonicalJson(body)) !== request.requestChecksum) {
    return { status: 'REJECTED', reason: 'GPU_BATCH_REQUEST_CHECKSUM_MISMATCH' };
  }
  return { status: 'PROVEN', reason: null };
}
