import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
vi.mock('pg', () => ({ default: { Pool: class {} } }));

import {
  LatentAtlasTopologyDomainMatrixSchema,
  slerp4D,
  buildLatentTopologyDomainMatrix,
  type Coordinate4D,
} from './latent-atlas-topology-domain-matrix-v1.js';

describe('LatentAtlasTopologyDomainMatrixV1', () => {
  const dummySha = 'sha256:' + 'a'.repeat(64);
  const q1: Coordinate4D = [1.0, 0.0, 0.0, 0.0];
  const q2: Coordinate4D = [0.0, 1.0, 0.0, 0.0];

  it('validates a correct matrix payload', () => {
    const matrix = buildLatentTopologyDomainMatrix({
      matrixId: 'matrix-001',
      sequenceId: 'seq-proc-001',
      sequenceRevision: dummySha,
      featureId: 'feat-legal-tax',
      featureLabel: 'tax_analysis_pipeline',
      sourceRef: 'src/lib/server/agent/patch-tournament.ts',
      candidateOrdinal: 42,
      somCoordinate: { row: 5, col: 10, cellIndex: 110 },
      coord4D: q1,
      kmeansClusterId: 35,
      channel6Features: [0.8, 0.5, 0.7, 0.9, 0.3, 0.6],
      presenceMask: 63,
      contentEmbedding768Digest: dummySha,
      hiddenAlignment: {
        modelId: 'ornith-1.5-9b',
        hiddenDimension: 4096,
        projectionDimension: 768,
        scaleFactor: 1.0,
        activationFunction: 'gelu',
        contextualMlpAligned: true,
      },
    });

    expect(matrix.schema).toBe('atlas.latent-topology-domain-matrix.v1');
    expect(matrix.matrixChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(matrix.canonicalAuthority).toBe(false);
    expect(matrix.writesPerformed).toBe(false);
  });

  it('rejects an un-normalized 4D quaternion', () => {
    expect(() => {
      buildLatentTopologyDomainMatrix({
        matrixId: 'matrix-002',
        sequenceId: 'seq-proc-002',
        sequenceRevision: dummySha,
        featureId: 'feat-invalid',
        featureLabel: 'invalid_norm',
        sourceRef: 'src/lib/server/auth.ts',
        candidateOrdinal: 1,
        somCoordinate: { row: 0, col: 0, cellIndex: 0 },
        coord4D: [2.0, 2.0, 0.0, 0.0] as any, // Not unit norm!
        kmeansClusterId: 1,
        channel6Features: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
        presenceMask: 63,
        contentEmbedding768Digest: dummySha,
        hiddenAlignment: {
          modelId: 'ornith-1.5-9b',
          hiddenDimension: 4096,
          projectionDimension: 768,
          scaleFactor: 1.0,
          activationFunction: 'gelu',
          contextualMlpAligned: true,
        },
      });
    }).toThrow();
  });

  it('computes spherical linear interpolation (SLERP) on 4D unit quaternions', () => {
    // At t = 0: returns q1
    const res0 = slerp4D(q1, q2, 0.0);
    expect(res0[0]).toBeCloseTo(1.0, 4);
    expect(res0[1]).toBeCloseTo(0.0, 4);

    // At t = 1: returns q2
    const res1 = slerp4D(q1, q2, 1.0);
    expect(res1[0]).toBeCloseTo(0.0, 4);
    expect(res1[1]).toBeCloseTo(1.0, 4);

    // At t = 0.5: midpoint on unit sphere S^3
    const resMid = slerp4D(q1, q2, 0.5);
    expect(resMid[0]).toBeCloseTo(Math.SQRT1_2, 4);
    expect(resMid[1]).toBeCloseTo(Math.SQRT1_2, 4);

    // Preserves unit norm
    const norm = Math.hypot(...resMid);
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it('rejects out-of-bounds SOM and cluster coordinates', () => {
    expect(() => {
      LatentAtlasTopologyDomainMatrixSchema.parse({
        schema: 'atlas.latent-topology-domain-matrix.v1',
        matrixId: 'm1',
        sequenceId: 's1',
        sequenceRevision: dummySha,
        featureId: 'f1',
        featureLabel: 'l1',
        sourceRef: 'ref',
        candidateOrdinal: 0,
        somCoordinate: { row: 25, col: 0, cellIndex: 500 }, // row > 19, total > 399
        coord4D: q1,
        kmeansClusterId: 200, // cluster > 127
        channel6Features: [1.2, 0, 0, 0, 0, 0], // > 1.0
        presenceMask: 100, // > 63
        contentEmbedding768Digest: dummySha,
        hiddenAlignment: {
          modelId: 'ornith-1.5-9b',
          hiddenDimension: 4096,
          projectionDimension: 768,
          scaleFactor: 1.0,
          activationFunction: 'gelu',
          contextualMlpAligned: true,
        },
        matrixChecksum: dummySha,
        canonicalAuthority: false,
        writesPerformed: false,
        generatedAt: new Date().toISOString(),
      });
    }).toThrow();
  });
});
