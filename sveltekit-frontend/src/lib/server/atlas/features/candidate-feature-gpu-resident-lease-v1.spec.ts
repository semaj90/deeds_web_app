import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from './candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar } from './candidate-feature-columnar-v1.js';
import { materializeCandidateFeatureGpuPack } from './candidate-feature-gpu-pack-v1.js';
import {
  buildCandidateFeatureGpuResidentLease,
  releaseCandidateFeatureGpuResidentLease,
  verifyCandidateFeatureGpuResidentLease,
} from './candidate-feature-gpu-resident-lease-v1.js';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function encodeI32LE(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  values.forEach((value, index) => view.setInt32(index * 4, value, true));
  return bytes;
}

function packFixture() {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:gpu-lease:v1',
    workspaceRevision: 'workspace:gpu-lease:v1',
    producerRevision: 'gpu-lease-test:v1',
    candidates: [
      {
        canonicalId: 'candidate:b', packetKey: 'packet:b', treeNodeId: 'tree:b', symbolVersionId: 'symbol:b',
        workspaceRevision: 'workspace:gpu-lease:v1', sourceRevision: 'source:b:v1', graphRevision: 'graph:v1', semanticRevision: 'semantic:768:v1', degradedIdentity: true, evidenceRefs: ['e:b'],
      },
      {
        canonicalId: 'candidate:a', packetKey: 'packet:a', treeNodeId: 'tree:a', symbolVersionId: 'symbol:a',
        workspaceRevision: 'workspace:gpu-lease:v1', sourceRevision: 'source:a:v1', graphRevision: 'graph:v1', semanticRevision: 'semantic:768:v1', degradedIdentity: false, evidenceRefs: ['e:a'],
      },
    ],
  });
  const byId = new Map(ordinalMap.candidates.map((row) => [row.canonicalId, row.candidateOrdinal]));
  const row = (canonicalId: 'candidate:a' | 'candidate:b', score: number, degradedIdentity: boolean) => {
    const suffix = canonicalId.at(-1)!;
    return {
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal: byId.get(canonicalId)!,
      canonicalId,
      packetKey: `packet:${suffix}`,
      treeNodeId: `tree:${suffix}`,
      symbolVersionId: `symbol:${suffix}`,
      workspaceRevision: 'workspace:gpu-lease:v1',
      sourceRevision: `source:${suffix}:v1`,
      graphRevision: 'graph:v1',
      semanticRevision: 'semantic:768:v1',
      featureRevision: 'features:gpu-lease:v1',
      semanticRelevance: score,
      lexicalRelevance: null,
      astAffinity: null,
      graphAuthority: null,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: null,
      executionUtility: null,
      memoryUtility: null,
      laneMask: ['semantic'] as const,
      degradedIdentity,
      evidenceRefs: [`e:${suffix}`],
    };
  };
  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision: 'features:gpu-lease:v1',
    producerRevision: 'gpu-lease-test:v1',
    rows: [row('candidate:b', 0.5, true), row('candidate:a', 1, false)],
  });
  const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'gpu-lease-test:v1' });
  return materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 4, producerRevision: 'gpu-lease-test:v1' });
}

const bufferIds = {
  FEATURE_VALUES: 'buf:values:1',
  FEATURE_PRESENCE: 'buf:presence:1',
  VALID_MASK: 'buf:valid:1',
  LANE_MASK_U16: 'buf:lane:1',
  DEGRADED_IDENTITY: 'buf:degraded:1',
};

function residentChecksums(pack: ReturnType<typeof packFixture>) {
  return {
    FEATURE_VALUES: pack.featureValuesChecksum,
    FEATURE_PRESENCE: pack.featurePresenceChecksum,
    VALID_MASK: pack.validMaskChecksum,
    LANE_MASK_U16: sha256(encodeI32LE(pack.laneMaskU16)),
    DEGRADED_IDENTITY: pack.degradedIdentityChecksum,
  };
}

function activeLease() {
  const pack = packFixture();
  return buildCandidateFeatureGpuResidentLease({
    pack,
    leaseId: 'lease:gpu-features:1',
    leaseEpoch: 7,
    deviceId: 0,
    stagingMode: 'PAGEABLE_SYNC',
    createdAt: '2026-08-22T03:00:00.000Z',
    expiresAt: '2026-08-22T03:05:00.000Z',
    bufferIds,
    residentChecksums: residentChecksums(pack),
  });
}

describe('CandidateFeatureGpuResidentLeaseV1', () => {
  it('binds five opaque GPU-resident buffers to FEAT-03D source and resident checksums', () => {
    const pack = packFixture();
    const lease = activeLease();
    const verified = verifyCandidateFeatureGpuResidentLease({
      pack,
      lease,
      now: '2026-08-22T03:01:00.000Z',
    });

    expect(verified.state).toBe('ACTIVE');
    expect(verified.leaseEpoch).toBe(7);
    expect(verified.buffers).toHaveLength(5);
    expect(verified.rawPointerExposed).toBe(false);
    expect(verified.cudaIpcExported).toBe(false);
    expect(verified.identityAuthority).toBe(false);
    expect(verified.buffers.every((buffer) => buffer.address.locator.storage === 'GPU_RESIDENT')).toBe(true);
    expect(verified.buffers.find((buffer) => buffer.kind === 'FEATURE_VALUES')?.sourceChecksum).toBe(pack.featureValuesChecksum);
    expect(verified.buffers.find((buffer) => buffer.kind === 'VALID_MASK')?.sourceChecksum).toBe(pack.validMaskChecksum);

    const lane = verified.buffers.find((buffer) => buffer.kind === 'LANE_MASK_U16')!;
    expect(lane.sourceChecksum).toBe(pack.laneMaskChecksum);
    expect(lane.residentChecksum).toBe(residentChecksums(pack).LANE_MASK_U16);
    expect(lane.address.locator.storage === 'GPU_RESIDENT' && lane.address.locator.dtype).toBe('i32');
    expect(lane.address.checksum).toBe(lane.residentChecksum);
  });

  it('rejects a source-checksum substitution even when resident bytes and buffer ID are unchanged', () => {
    const pack = packFixture();
    const lease = activeLease();
    const tampered = structuredClone(lease);
    const values = tampered.buffers.find((buffer) => buffer.kind === 'FEATURE_VALUES')!;
    values.sourceChecksum = 'f'.repeat(64);

    expect(() => verifyCandidateFeatureGpuResidentLease({
      pack,
      lease: tampered,
      now: '2026-08-22T03:01:00.000Z',
    })).toThrow();
  });

  it('rejects resident-artifact checksum drift independently of FEAT-03D lineage', () => {
    const pack = packFixture();
    const tampered = structuredClone(activeLease());
    const lane = tampered.buffers.find((buffer) => buffer.kind === 'LANE_MASK_U16')!;
    lane.address.checksum = 'e'.repeat(64);
    expect(() => verifyCandidateFeatureGpuResidentLease({
      pack,
      lease: tampered,
      now: '2026-08-22T03:01:00.000Z',
    })).toThrow();
  });

  it('fails closed after expiry', () => {
    expect(() => verifyCandidateFeatureGpuResidentLease({
      pack: packFixture(),
      lease: activeLease(),
      now: '2026-08-22T03:05:00.000Z',
    })).toThrow('FEATURE_GPU_LEASE_EXPIRED');
  });

  it('release preserves lineage but prevents subsequent ACTIVE use', () => {
    const pack = packFixture();
    const active = activeLease();
    const released = releaseCandidateFeatureGpuResidentLease({
      lease: active,
      releasedAt: '2026-08-22T03:02:00.000Z',
    });

    expect(released.state).toBe('RELEASED');
    expect(released.releasedAt).toBe('2026-08-22T03:02:00.000Z');
    expect(released.leaseEpoch).toBe(active.leaseEpoch);
    expect(released.gpuPackChecksum).toBe(active.gpuPackChecksum);
    expect(released.buffers.map((buffer) => buffer.address.locator)).toEqual(active.buffers.map((buffer) => buffer.address.locator));
    expect(released.leaseChecksum).not.toBe(active.leaseChecksum);

    expect(() => verifyCandidateFeatureGpuResidentLease({
      pack,
      lease: released,
      now: '2026-08-22T03:03:00.000Z',
    })).toThrow('FEATURE_GPU_LEASE_NOT_ACTIVE:RELEASED');
    expect(() => releaseCandidateFeatureGpuResidentLease({
      lease: released,
      releasedAt: '2026-08-22T03:03:30.000Z',
    })).toThrow('FEATURE_GPU_LEASE_RELEASE_REQUIRES_ACTIVE:RELEASED');
  });
});
