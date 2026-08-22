import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  buildCandidateFeatureGpuReleaseReceipt,
  buildCandidateFeatureGpuResidencyLease,
  verifyGpuResidentArtifactLease,
} from './candidate-feature-gpu-residency-v1.js';

const H = (value: string) => createHash('sha256').update(value).digest('hex');
const FEATURE_COUNT = 12;
const PHYSICAL_ROWS = 32;

function pack() {
  return {
    schema: 'atlas.candidate-feature-gpu-pack.v1' as const,
    candidateSnapshotRevision: 'candidate:r1',
    ordinalMapChecksum: H('ordinal-map'),
    featureSnapshotChecksum: H('feature-snapshot'),
    workspaceRevision: 'workspace:r1',
    featureRevision: 'feature:r1',
    columnarChecksum: H('columnar'),
    logicalRows: 2,
    physicalRows: PHYSICAL_ROWS,
    paddingRows: PHYSICAL_ROWS - 2,
    rowAlignment: 32,
    featureCount: FEATURE_COUNT as 12,
    featureNames: [
      'semanticRelevance', 'lexicalRelevance', 'astAffinity', 'graphAuthority',
      'personalizedPageRank', 'communityAffinity', 'manifold4OrientationSimilarity',
      'crossEncoderRawScore', 'crossEncoderCalibratedScore', 'domainAffinity',
      'executionUtility', 'memoryUtility',
    ] as const,
    featureValues: Array(PHYSICAL_ROWS * FEATURE_COUNT).fill(0),
    featurePresence: Array(PHYSICAL_ROWS * FEATURE_COUNT).fill(0),
    validMask: [1, 1, ...Array(PHYSICAL_ROWS - 2).fill(0)],
    laneMaskU16: [3, 5, ...Array(PHYSICAL_ROWS - 2).fill(0)],
    degradedIdentity: [0, 1, ...Array(PHYSICAL_ROWS - 2).fill(0)],
    featureValuesChecksum: H('feature-values'),
    featurePresenceChecksum: H('feature-presence'),
    validMaskChecksum: H('valid-mask'),
    laneMaskChecksum: H('lane-mask-u16'),
    degradedIdentityChecksum: H('degraded'),
    gpuPackChecksum: H('gpu-pack'),
    byteOrder: 'little-endian' as const,
    featureDtype: 'float32' as const,
    presenceDtype: 'uint8' as const,
    validMaskDtype: 'uint8' as const,
    laneMaskSourceDtype: 'uint16' as const,
    paddingPolicy: 'ZERO_INVALID_MASKED_V1' as const,
    logicalOrdinalEqualsPhysicalRowForValidPrefix: true as const,
    paddedRowsCarryIdentity: false as const,
    gpuResident: false as const,
    identityAuthority: false as const,
    canonicalOwnerChanged: false as const,
    producerRevision: 'gpu-pack:test:v1',
  };
}

function observation() {
  const source = pack();
  return {
    schema: 'atlas.candidate-feature-gpu-residency-observation.v1' as const,
    leaseId: 'lease:test:1',
    deviceId: 0,
    deviceName: 'test-cuda-device',
    sourceGpuPackChecksum: source.gpuPackChecksum,
    candidateSnapshotRevision: source.candidateSnapshotRevision,
    ordinalMapChecksum: source.ordinalMapChecksum,
    featureSnapshotChecksum: source.featureSnapshotChecksum,
    columnarChecksum: source.columnarChecksum,
    logicalRows: source.logicalRows,
    physicalRows: source.physicalRows,
    featureCount: 12 as const,
    hostStagingMode: 'PINNED_ASYNC' as const,
    gpuExecutionObserved: true as const,
    ipcExported: false as const,
    buffers: [
      { role: 'feature_values' as const, bufferId: 'b:values', dtype: 'f32' as const, shape: [PHYSICAL_ROWS, 12], sourceChecksum: source.featureValuesChecksum, materializedChecksum: H('gpu-values'), deviceAllocationObserved: true as const, readbackVerified: true as const },
      { role: 'feature_presence' as const, bufferId: 'b:presence', dtype: 'u8' as const, shape: [PHYSICAL_ROWS, 12], sourceChecksum: source.featurePresenceChecksum, materializedChecksum: H('gpu-presence'), deviceAllocationObserved: true as const, readbackVerified: true as const },
      { role: 'valid_mask' as const, bufferId: 'b:valid', dtype: 'u8' as const, shape: [PHYSICAL_ROWS], sourceChecksum: source.validMaskChecksum, materializedChecksum: H('gpu-valid'), deviceAllocationObserved: true as const, readbackVerified: true as const },
      { role: 'lane_mask' as const, bufferId: 'b:lane', dtype: 'i32' as const, shape: [PHYSICAL_ROWS], sourceChecksum: source.laneMaskChecksum, materializedChecksum: H('gpu-lane-i32'), deviceAllocationObserved: true as const, readbackVerified: true as const },
      { role: 'degraded_identity' as const, bufferId: 'b:degraded', dtype: 'u8' as const, shape: [PHYSICAL_ROWS], sourceChecksum: source.degradedIdentityChecksum, materializedChecksum: H('gpu-degraded'), deviceAllocationObserved: true as const, readbackVerified: true as const },
    ],
    issuedAt: '2026-08-22T03:00:00.000Z',
    expiresAt: '2026-08-22T03:05:00.000Z',
    producerRevision: 'gpu-residency:test:v1',
    observationChecksum: H('observation'),
  };
}

describe('CandidateFeature GPU residency lifecycle', () => {
  it('binds actual GPU observations to immutable GPU_RESIDENT artifact addresses', () => {
    const lease = buildCandidateFeatureGpuResidencyLease({
      pack: pack(), observation: observation(), producerRevision: 'atlas-gpu-residency-bridge:test:v1',
    });
    expect(lease.ownerProcessResident).toBe(true);
    expect(lease.cudaIpcExported).toBe(false);
    expect(lease.artifacts).toHaveLength(5);
    expect(lease.artifacts.every((item) => item.address.locator.storage === 'GPU_RESIDENT')).toBe(true);
    expect(lease.artifacts.map((item) => item.role)).toEqual([
      'feature_values', 'feature_presence', 'valid_mask', 'lane_mask', 'degraded_identity',
    ]);
    expect(lease.identityAuthority).toBe(false);
  });

  it('rejects a GPU observation whose source buffer checksum does not match FEAT-03D', () => {
    const observed = observation();
    observed.buffers[0] = { ...observed.buffers[0], sourceChecksum: H('wrong-source') };
    expect(() => buildCandidateFeatureGpuResidencyLease({
      pack: pack(), observation: observed, producerRevision: 'bridge:test:v1',
    })).toThrow(/GPU_RESIDENCY_SOURCE_CHECKSUM_MISMATCH:feature_values/);
  });

  it('proves an address only while the exact lease is active and unexpired', () => {
    const lease = buildCandidateFeatureGpuResidencyLease({
      pack: pack(), observation: observation(), producerRevision: 'bridge:test:v1',
    });
    const artifact = lease.artifacts[0]!;
    expect(verifyGpuResidentArtifactLease({
      lease, address: artifact.address, role: artifact.role, now: new Date('2026-08-22T03:01:00.000Z'),
    })).toEqual({ status: 'PROVEN', reason: null });
    expect(verifyGpuResidentArtifactLease({
      lease, address: artifact.address, role: artifact.role, now: new Date('2026-08-22T03:06:00.000Z'),
    })).toEqual({ status: 'REJECTED', reason: 'GPU_RESIDENCY_LEASE_EXPIRED' });
  });

  it('emits a separate release receipt rather than mutating the immutable lease', () => {
    const lease = buildCandidateFeatureGpuResidencyLease({
      pack: pack(), observation: observation(), producerRevision: 'bridge:test:v1',
    });
    const release = buildCandidateFeatureGpuReleaseReceipt({ lease, releasedAt: '2026-08-22T03:02:00.000Z' });
    expect(release.state).toBe('RELEASED');
    expect(release.leaseChecksum).toBe(lease.leaseChecksum);
    expect(release.bufferIds).toHaveLength(5);
    expect(lease.state).toBe('ACTIVE');
  });
});
