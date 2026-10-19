import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

test('LatentAtlasTopologyDomainMatrixV1 Node Test', async (t) => {
  const {
    LatentAtlasTopologyDomainMatrixSchema,
    slerp4D,
    buildLatentTopologyDomainMatrix,
  } = await import('../../sveltekit-frontend/src/lib/server/topology/latent-atlas-topology-domain-matrix-v1.ts');

  const dummySha = 'sha256:' + 'a'.repeat(64);
  const q1 = [1.0, 0.0, 0.0, 0.0];
  const q2 = [0.0, 1.0, 0.0, 0.0];

  await t.test('buildLatentTopologyDomainMatrix produces valid schema and checksum', () => {
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

    assert.equal(matrix.schema, 'atlas.latent-topology-domain-matrix.v1');
    assert.match(matrix.matrixChecksum, /^sha256:[0-9a-f]{64}$/);
    assert.equal(matrix.canonicalAuthority, false);
    assert.equal(matrix.writesPerformed, false);
  });

  await t.test('slerp4D spherical linear interpolation preserves unit quaternion norm', () => {
    const res0 = slerp4D(q1, q2, 0.0);
    assert.ok(Math.abs(res0[0] - 1.0) < 1e-4);
    assert.ok(Math.abs(res0[1] - 0.0) < 1e-4);

    const res1 = slerp4D(q1, q2, 1.0);
    assert.ok(Math.abs(res1[0] - 0.0) < 1e-4);
    assert.ok(Math.abs(res1[1] - 1.0) < 1e-4);

    const resMid = slerp4D(q1, q2, 0.5);
    assert.ok(Math.abs(resMid[0] - Math.SQRT1_2) < 1e-4);
    assert.ok(Math.abs(resMid[1] - Math.SQRT1_2) < 1e-4);

    const norm = Math.hypot(...resMid);
    assert.ok(Math.abs(norm - 1.0) < 1e-5);
  });

  await t.test('rejects invalid quaternion norm', () => {
    assert.throws(() => {
      buildLatentTopologyDomainMatrix({
        matrixId: 'matrix-002',
        sequenceId: 'seq-proc-002',
        sequenceRevision: dummySha,
        featureId: 'feat-invalid',
        featureLabel: 'invalid_norm',
        sourceRef: 'src/lib/server/auth.ts',
        candidateOrdinal: 1,
        somCoordinate: { row: 0, col: 0, cellIndex: 0 },
        coord4D: [2.0, 2.0, 0.0, 0.0],
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
    });
  });
});
