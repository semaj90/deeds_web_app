import { describe, expect, it } from 'vitest';
import {
  Manifold4OrientationV1Schema,
  canonicalizeQuaternionWxyz,
  quaternionAngularDistance,
  quaternionOrientationSimilarity,
} from './manifold4-orientation-v1.js';

describe('Manifold4OrientationV1', () => {
  it('canonicalizes q and -q to the same representative', () => {
    const q = canonicalizeQuaternionWxyz([0.5, 0.5, 0.5, 0.5]);
    const neg = canonicalizeQuaternionWxyz([-0.5, -0.5, -0.5, -0.5]);
    expect(neg).toEqual(q);
  });

  it('treats q and -q as the same rotation', () => {
    const q = canonicalizeQuaternionWxyz([1, 2, 3, 4]);
    const neg = canonicalizeQuaternionWxyz([-1, -2, -3, -4]);
    expect(quaternionOrientationSimilarity(q, neg)).toBeCloseTo(1, 12);
    expect(quaternionAngularDistance(q, neg)).toBeCloseTo(0, 12);
  });

  it('rejects non-unit stored quaternions', () => {
    const parsed = Manifold4OrientationV1Schema.safeParse({
      schema: 'atlas.manifold4.orientation.v1',
      candidateOrdinal: 7,
      canonicalId: 'symbol:v1:foo',
      workspaceRevision: 'ws:1',
      sourceRevision: 'src:1',
      featureRevision: 'feat:1',
      producerRevision: 'producer:1',
      componentOrder: 'wxyz',
      quaternion: [2, 0, 0, 0],
      source: 'som_projection',
      evidenceRefs: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a revision-qualified unit orientation feature', () => {
    const q = canonicalizeQuaternionWxyz([1, 2, 3, 4]);
    const parsed = Manifold4OrientationV1Schema.parse({
      schema: 'atlas.manifold4.orientation.v1',
      candidateOrdinal: 7,
      canonicalId: 'symbol:v1:foo',
      workspaceRevision: 'ws:1',
      sourceRevision: 'src:1',
      featureRevision: 'feat:1',
      producerRevision: 'producer:1',
      componentOrder: 'wxyz',
      quaternion: q,
      source: 'som_projection',
      evidenceRefs: ['packet:foo'],
    });
    expect(parsed.candidateOrdinal).toBe(7);
  });
});
