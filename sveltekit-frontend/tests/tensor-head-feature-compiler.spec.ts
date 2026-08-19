import { describe, expect, it } from 'vitest';
import { compileTensorHeadFeatureSnapshot } from '$lib/server/atlas/runtime/tensor-head-feature-compiler.js';

describe('compileTensorHeadFeatureSnapshot', () => {
  it('keeps missing enrichment unknown instead of zero', () => {
    const snapshot = compileTensorHeadFeatureSnapshot({
      requestId: 'r1', featureRevision: 'f1', representationRevision: 'semantic_768:v1',
      semanticSimilarity: .9, pagerankGlobal: null, ontologyMatch: .8,
    });
    expect(snapshot.signals.semantic).toBe(.9);
    expect(snapshot.signals.pagerank).toBeNull();
    expect(snapshot.missingLabels).toContain('pagerank');
  });

  it('records a 2x2 Jacobian only as a diagnostic', () => {
    const snapshot = compileTensorHeadFeatureSnapshot({
      requestId: 'r2', featureRevision: 'f2', representationRevision: 'semantic_768:v1',
      jacobian2x2: [[2, 0], [0, 2]], semanticSimilarity: .5,
    });
    expect(snapshot.diagnostics.jacobianDeterminant).toBe(4);
    expect(snapshot.diagnostics.jacobianFrobeniusNorm).toBeCloseTo(Math.sqrt(8));
    expect(snapshot.signals).not.toHaveProperty('jacobian');
  });
});
