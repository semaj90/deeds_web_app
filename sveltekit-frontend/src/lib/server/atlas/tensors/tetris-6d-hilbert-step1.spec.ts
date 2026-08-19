import { describe, expect, it } from 'vitest';
import {
  buildDerivedHilbertLocalityEdges,
  buildTetris6DKeyValue,
  defaultTetris6DBounds,
  hilbertIndexND,
  planHilbertDomain,
} from './tetris-6d-hilbert-step1.js';

describe('Tetris 6DoF Hilbert step 1', () => {
  it('plans 100M logical items without allocating 100M rows', () => {
    const plan = planHilbertDomain({
      dimensions: 6,
      logicalCapacityRequested: 100_000_000,
      producerRevision: 'test',
    });

    // ceil(log2(100,000,000) / 6) = 5 bits/axis.
    // Six axes therefore produce a 30-bit Hilbert keyspace: 2^30 > 100M.
    expect(plan.bitsPerAxis).toBe(5);
    expect(plan.binsPerAxis).toBe(32);
    expect(plan.keyBits).toBe(30);
    expect(BigInt(plan.keyspaceCapacity)).toBe(1n << 30n);
    expect(BigInt(plan.keyspaceCapacity)).toBeGreaterThan(100_000_000n);
    expect(plan.localityOnly).toBe(true);
  });

  it('encodes a 6DoF pose into compact locality/member keys while leaving SOM/KMeans unset', () => {
    const row = buildTetris6DKeyValue({
      canonicalId: 'piece:T:0001',
      piece: 'T',
      pose: [0.25, -0.5, 0.75, Math.PI / 2, 0, -Math.PI / 4],
      bounds: defaultTetris6DBounds(),
      bitsPerAxis: 5,
      representationRevision: 'tetris6d-r1',
      producerRevision: 'test',
    });

    expect(row.quantizedPose6D).toHaveLength(6);
    expect(row.clusterVector6).toHaveLength(6);
    expect(row.somFixtureVector64).toHaveLength(64);
    expect(row.somFixtureVector64.slice(0, 6)).toEqual(row.clusterVector6);
    expect(row.somFixtureVector64.slice(6).every((value) => value === 0)).toBe(true);
    expect(row.somAssignment).toBeNull();
    expect(row.kmeansCluster).toBeNull();
    expect(row.canonicalGraphRelation).toBe(false);
    expect(row.localityBucketKey).toMatch(/^tetris6d-r1:h6:b/);
    expect(row.memberKey).toContain('piece:T:0001');
  });

  it('wraps periodic roll/pitch/yaw instead of treating angles as unbounded scalars', () => {
    const bounds = defaultTetris6DBounds();
    const a = buildTetris6DKeyValue({
      canonicalId: 'piece:I:a', piece: 'I',
      pose: [0, 0, 0, 0, 0, 0], bounds, bitsPerAxis: 5,
      representationRevision: 'r1', producerRevision: 'test',
    });
    const b = buildTetris6DKeyValue({
      canonicalId: 'piece:I:b', piece: 'I',
      pose: [0, 0, 0, Math.PI * 2, -Math.PI * 2, Math.PI * 4], bounds, bitsPerAxis: 5,
      representationRevision: 'r1', producerRevision: 'test',
    });

    expect(a.quantizedPose6D).toEqual(b.quantizedPose6D);
    expect(a.hilbertIndexDecimal).toBe(b.hilbertIndexDecimal);
  });

  it('keeps Hilbert collisions safe by making member identity compound', () => {
    const bounds = defaultTetris6DBounds();
    const a = buildTetris6DKeyValue({
      canonicalId: 'piece:O:a', piece: 'O', pose: [0, 0, 0, 0, 0, 0], bounds,
      bitsPerAxis: 5, representationRevision: 'r1', producerRevision: 'test',
    });
    const b = buildTetris6DKeyValue({
      canonicalId: 'piece:O:b', piece: 'O', pose: [0, 0, 0, 0, 0, 0], bounds,
      bitsPerAxis: 5, representationRevision: 'r1', producerRevision: 'test',
    });

    expect(a.hilbertIndexDecimal).toBe(b.hilbertIndexDecimal);
    expect(a.memberKey).not.toBe(b.memberKey);
  });

  it('maps deterministic n-D integer points to deterministic BigInt Hilbert keys', () => {
    const p: readonly number[] = [0, 0, 0, 0, 0, 0];
    expect(hilbertIndexND(p, 3)).toBe(hilbertIndexND(p, 3));
    expect(hilbertIndexND([1, 0, 0, 0, 0, 0], 3)).not.toBe(hilbertIndexND(p, 3));
  });

  it('creates only derived locality edges for graph step one', () => {
    const bounds = defaultTetris6DBounds();
    const rows = [
      buildTetris6DKeyValue({ canonicalId: 'A', piece: 'I', pose: [-0.8, 0, 0, 0, 0, 0], bounds, bitsPerAxis: 4, representationRevision: 'r1', producerRevision: 'test' }),
      buildTetris6DKeyValue({ canonicalId: 'B', piece: 'T', pose: [0, 0, 0, 0, 0, 0], bounds, bitsPerAxis: 4, representationRevision: 'r1', producerRevision: 'test' }),
      buildTetris6DKeyValue({ canonicalId: 'C', piece: 'L', pose: [0.8, 0, 0, 0, 0, 0], bounds, bitsPerAxis: 4, representationRevision: 'r1', producerRevision: 'test' }),
    ];

    const edges = buildDerivedHilbertLocalityEdges(rows);
    expect(edges).toHaveLength(rows.length - 1);
    expect(edges.every((edge) => edge.relation === 'HILBERT_LOCALITY_HINT')).toBe(true);
    expect(edges.every((edge) => edge.canonicalGraphRelation === false)).toBe(true);
  });
});
