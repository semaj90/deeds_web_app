import { describe, expect, it } from 'vitest';
import { cosineSimilarity01, scoreContextTreeChildren, selectContextTreeFanout } from './contextual-sparse-tree.js';

const weights = {
  cosine: 1,
  structural: 1,
  lexical: 1,
  authority: 1,
  tool: 1,
  temperature: 1,
};

const node = (canonicalId: string, values: Partial<{
  cosineSimilarity: number;
  structuralAffinity: number;
  sparseLexicalAffinity: number;
  graphAuthority: number;
  toolRelevance: number;
}> = {}) => ({
  canonicalId,
  parentCanonicalId: 'root',
  depth: 1,
  source: 'NETWORKX_REFERENCE' as const,
  cosineSimilarity: values.cosineSimilarity ?? null,
  structuralAffinity: values.structuralAffinity ?? null,
  sparseLexicalAffinity: values.sparseLexicalAffinity ?? null,
  graphAuthority: values.graphAuthority ?? null,
  toolRelevance: values.toolRelevance ?? null,
  evidenceRefs: [`ref:${canonicalId}`],
});

describe('contextual sparse tree', () => {
  it('maps cosine similarity into a bounded [0,1] score', () => {
    expect(cosineSimilarity01([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity01([1, 0], [-1, 0])).toBeCloseTo(0);
    expect(cosineSimilarity01([0, 0], [1, 0])).toBe(0);
  });

  it('uses numerically stable local softmax and preserves probability mass', () => {
    const rows = scoreContextTreeChildren({
      children: [
        node('A', { cosineSimilarity: 1, structuralAffinity: 1 }),
        node('B', { cosineSimilarity: 0, structuralAffinity: 0.1 }),
        node('C', { cosineSimilarity: -1 }),
      ],
      weights,
    });
    expect(rows[0].canonicalId).toBe('A');
    expect(rows.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1);
    expect(rows.every((row) => row.probability >= 0 && row.probability <= 1)).toBe(true);
  });

  it('bounds fanout without converting omitted nodes into negative evidence', () => {
    const selected = selectContextTreeFanout({
      children: [node('A', { structuralAffinity: 1 }), node('B', { structuralAffinity: 0.5 })],
      weights,
      maxChildren: 1,
    });
    expect(selected).toHaveLength(1);
    expect(selected[0].canonicalId).toBe('A');
  });
});
