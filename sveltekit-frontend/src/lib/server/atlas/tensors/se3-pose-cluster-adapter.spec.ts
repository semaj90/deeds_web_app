import { describe, expect, it } from 'vitest';
import { buildTetris6DKeyValue, defaultTetris6DBounds } from './tetris-6d-hilbert-step1.js';
import { evaluatePoseClusterContinuity, toPoseClusterInput } from './se3-pose-cluster-adapter.js';

const bounds = defaultTetris6DBounds();

function row(id: string, yaw: number, x = 0) {
  return buildTetris6DKeyValue({
    canonicalId: id,
    piece: 'T',
    pose: [x, 0, 0, 0, 0, yaw],
    bounds,
    bitsPerAxis: 5,
    representationRevision: 'pose-r1',
    producerRevision: 'test',
  });
}

describe('SE3 pose cluster adapter', () => {
  it('emits both Euler and quaternion fixture widths without semantic authority', () => {
    const r = row('a', Math.PI / 4);
    expect(toPoseClusterInput(r, 'EULER6_FIXTURE').vector).toHaveLength(6);
    expect(toPoseClusterInput(r, 'SE3_QUATERNION7').vector).toHaveLength(7);
    expect(toPoseClusterInput(r, 'SOM64_EULER_PADDED').vector).toHaveLength(64);
    expect(toPoseClusterInput(r, 'SOM64_QUATERNION_PADDED').vector).toHaveLength(64);
    expect(toPoseClusterInput(r, 'SE3_QUATERNION7').canonicalSemanticAuthority).toBe(false);
  });

  it('treats wrap-around orientations as physically close in the continuity metric', () => {
    const rows = [row('a', Math.PI - 0.01), row('b', -Math.PI + 0.01), row('c', 0)];
    const report = evaluatePoseClusterContinuity({
      rows,
      clusterByCanonicalId: { a: 1, b: 1, c: 2 },
      mode: 'SE3_QUATERNION7',
      producerRevision: 'test',
    });
    expect(report.meanPhysicalDistanceSameCluster).not.toBeNull();
    expect(report.meanPhysicalDistanceSameCluster!).toBeLessThan(0.05);
    expect(report.continuitySeparation).not.toBeNull();
    expect(report.continuitySeparation!).toBeGreaterThan(1);
  });

  it('includes translation distance independently of rotational distance', () => {
    const rows = [row('a', 0, 0), row('b', 0, 0.5)];
    const report = evaluatePoseClusterContinuity({
      rows,
      clusterByCanonicalId: { a: 1, b: 1 },
      mode: 'SE3_QUATERNION7',
      producerRevision: 'test',
    });
    expect(report.meanPhysicalDistanceSameCluster).toBeCloseTo(0.25, 8);
  });
});
