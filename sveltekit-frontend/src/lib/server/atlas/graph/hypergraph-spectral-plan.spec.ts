import { describe, expect, it } from 'vitest';
import { buildHypergraphSpectralPlan } from './hypergraph-spectral-plan.js';

describe('hypergraph spectral planning', () => {
  it('keeps degree-5 hyperedge semantics separate from vector dimensionality', () => {
    const plan = buildHypergraphSpectralPlan({
      workspaceRevision: 'ws-1',
      hypergraphRevision: 'hg-1',
      vertexCount: 100,
      hyperedgeCount: 20,
      relationshipDegreeMin: 2,
      relationshipDegreeMax: 5,
      nClusters: 8,
      producerRevision: 'test',
    });
    expect(plan.relationshipDegreeMax).toBe(5);
    expect(plan.nEigenvectors).toBe(8);
    expect(plan.canonicalRelationCreationAllowed).toBe(false);
  });

  it('rejects cluster counts larger than the vertex set', () => {
    expect(() => buildHypergraphSpectralPlan({
      workspaceRevision: 'ws-1',
      hypergraphRevision: 'hg-1',
      vertexCount: 4,
      hyperedgeCount: 2,
      relationshipDegreeMin: 2,
      relationshipDegreeMax: 3,
      nClusters: 5,
      producerRevision: 'test',
    })).toThrow(/nClusters cannot exceed vertexCount/);
  });
});
