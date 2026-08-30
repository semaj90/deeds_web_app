import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildCandidateFeatureGpuBatchRequest, verifyCandidateFeatureGpuBatchRequest } from './candidate-feature-gpu-batch-request-v1.js';
import { buildCandidateFeatureGpuResidencyLease } from './candidate-feature-gpu-residency-v1.js';

const H = (value: string) => createHash('sha256').update(value).digest('hex');
const R = 32;
const F = 13;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

function observationChecksum(value: object): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function pack() {
  return {
    schema: 'atlas.candidate-feature-gpu-pack.v1' as const,
    candidateSnapshotRevision: 'candidate:r1', ordinalMapChecksum: H('ordinal-map'), featureSnapshotChecksum: H('feature-snapshot'),
    workspaceRevision: 'workspace:r1', featureRevision: 'feature:r1', columnarChecksum: H('columnar'),
    logicalRows: 3, physicalRows: R, paddingRows: R - 3, rowAlignment: 32, featureCount: F as 13,
    featureNames: ['semanticRelevance','lexicalRelevance','astAffinity','graphAuthority','personalizedPageRank','communityAffinity','manifold4OrientationSimilarity','crossEncoderRawScore','crossEncoderCalibratedScore','domainAffinity','executionUtility','memoryUtility','latentLocalityScore'] as const,
    featureValues: Array(R * F).fill(0), featurePresence: Array(R * F).fill(0),
    validMask: [1,1,1,...Array(R - 3).fill(0)], laneMaskU16: [1,3,5,...Array(R - 3).fill(0)], degradedIdentity: [0,0,1,...Array(R - 3).fill(0)],
    featureValuesChecksum: H('feature-values'), featurePresenceChecksum: H('feature-presence'), validMaskChecksum: H('valid-mask'), laneMaskChecksum: H('lane-mask-u16'), degradedIdentityChecksum: H('degraded'), gpuPackChecksum: H('gpu-pack'),
    byteOrder: 'little-endian' as const, featureDtype: 'float32' as const, presenceDtype: 'uint8' as const, validMaskDtype: 'uint8' as const, laneMaskSourceDtype: 'uint16' as const,
    paddingPolicy: 'ZERO_INVALID_MASKED_V1' as const, logicalOrdinalEqualsPhysicalRowForValidPrefix: true as const, paddedRowsCarryIdentity: false as const,
    gpuResident: false as const, identityAuthority: false as const, canonicalOwnerChanged: false as const, producerRevision: 'gpu-pack:test:v1',
  };
}

function lease() {
  const p = pack();
  const observationBody = {
    schema: 'atlas.candidate-feature-gpu-residency-observation.v1', leaseId: 'lease:batch:test:1', deviceId: 0, deviceName: 'test-cuda-device',
    sourceGpuPackChecksum: p.gpuPackChecksum, candidateSnapshotRevision: p.candidateSnapshotRevision, ordinalMapChecksum: p.ordinalMapChecksum,
    featureSnapshotChecksum: p.featureSnapshotChecksum, columnarChecksum: p.columnarChecksum, logicalRows: p.logicalRows, physicalRows: p.physicalRows,
    featureCount: 13, hostStagingMode: 'PINNED_ASYNC', gpuExecutionObserved: true, ipcExported: false,
    buffers: [
      { role: 'feature_values', bufferId: 'gpu:values', dtype: 'f32', shape: [R,13], sourceChecksum: p.featureValuesChecksum, materializedChecksum: H('gpu-values'), deviceAllocationObserved: true, readbackVerified: true },
      { role: 'feature_presence', bufferId: 'gpu:presence', dtype: 'u8', shape: [R,13], sourceChecksum: p.featurePresenceChecksum, materializedChecksum: H('gpu-presence'), deviceAllocationObserved: true, readbackVerified: true },
      { role: 'valid_mask', bufferId: 'gpu:valid', dtype: 'u8', shape: [R], sourceChecksum: p.validMaskChecksum, materializedChecksum: H('gpu-valid'), deviceAllocationObserved: true, readbackVerified: true },
      { role: 'lane_mask', bufferId: 'gpu:lane', dtype: 'i32', shape: [R], sourceChecksum: p.laneMaskChecksum, materializedChecksum: H('gpu-lane'), deviceAllocationObserved: true, readbackVerified: true },
      { role: 'degraded_identity', bufferId: 'gpu:degraded', dtype: 'u8', shape: [R], sourceChecksum: p.degradedIdentityChecksum, materializedChecksum: H('gpu-degraded'), deviceAllocationObserved: true, readbackVerified: true },
    ],
    issuedAt: '2026-08-22T03:00:00.000Z', expiresAt: '2026-08-22T03:10:00.000Z', producerRevision: 'gpu-residency:test:v1',
  };
  return buildCandidateFeatureGpuResidencyLease({
    pack: p,
    observation: { ...observationBody, observationChecksum: observationChecksum(observationBody) },
    producerRevision: 'gpu-residency-bridge:test:v1',
  });
}

describe('CandidateFeature GPU batch request', () => {
  it('is compact, ordinal-only, and bound to an active lease', () => {
    const l = lease();
    const request = buildCandidateFeatureGpuBatchRequest({ actionId: 'action:test:rank:1', operation: 'RANK', lease: l, candidateOrdinals: [2,0], topK: 1, now: new Date('2026-08-22T03:01:00.000Z'), producerRevision: 'gpu-batch:test:v1' });
    expect(request.candidateOrdinals).toEqual([2,0]);
    expect(request.buffers).toHaveLength(5);
    expect((request as Record<string, unknown>).featureValues).toBeUndefined();
    expect(request.identityAuthority).toBe(false);
    expect(verifyCandidateFeatureGpuBatchRequest({ request, lease: l, now: new Date('2026-08-22T03:01:30.000Z') })).toEqual({ status: 'PROVEN', reason: null });
  });

  it('rejects duplicate ordinals, out-of-range ordinals, and excessive topK', () => {
    const l = lease();
    expect(() => buildCandidateFeatureGpuBatchRequest({ actionId: 'action:test:dup', lease: l, candidateOrdinals: [1,1], topK: 1, now: new Date('2026-08-22T03:01:00.000Z'), producerRevision: 'gpu-batch:test:v1' })).toThrow();
    expect(() => buildCandidateFeatureGpuBatchRequest({ actionId: 'action:test:oor', lease: l, candidateOrdinals: [3], topK: 1, now: new Date('2026-08-22T03:01:00.000Z'), producerRevision: 'gpu-batch:test:v1' })).toThrow(/OUT_OF_RANGE/);
    expect(() => buildCandidateFeatureGpuBatchRequest({ actionId: 'action:test:k', lease: l, candidateOrdinals: [0,1], topK: 3, now: new Date('2026-08-22T03:01:00.000Z'), producerRevision: 'gpu-batch:test:v1' })).toThrow();
  });

  it('rejects an expired residency lease', () => {
    expect(() => buildCandidateFeatureGpuBatchRequest({ actionId: 'action:test:expired', lease: lease(), candidateOrdinals: [0], topK: 1, now: new Date('2026-08-22T03:11:00.000Z'), producerRevision: 'gpu-batch:test:v1' })).toThrow(/GPU_BATCH_RESIDENCY_LEASE_EXPIRED/);
  });

  it('detects opaque GPU buffer substitution', () => {
    const l = lease();
    const request = buildCandidateFeatureGpuBatchRequest({ actionId: 'action:test:substitution', lease: l, candidateOrdinals: [0,2], topK: 2, now: new Date('2026-08-22T03:01:00.000Z'), producerRevision: 'gpu-batch:test:v1' });
    const tampered = { ...request, buffers: request.buffers.map((buffer, index) => index === 0 ? { ...buffer, bufferId: 'gpu:attacker' } : buffer) };
    expect(verifyCandidateFeatureGpuBatchRequest({ request: tampered, lease: l, now: new Date('2026-08-22T03:01:30.000Z') })).toEqual({ status: 'REJECTED', reason: 'GPU_BATCH_BUFFER_SUBSTITUTION:feature_values' });
  });
});
