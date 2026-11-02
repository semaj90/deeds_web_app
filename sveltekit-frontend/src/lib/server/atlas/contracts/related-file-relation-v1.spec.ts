import { describe, expect, it } from 'vitest';
import { RelatedFileRelationV1Schema } from './related-file-relation-v1.js';

describe('related file relation v1', () => {
  it('keeps semantic proximity separate from canonical structural facts', () => {
    const relation = RelatedFileRelationV1Schema.parse({
      schema: 'atlas.related-file-relation.v1',
      relationId: 'relation:1',
      fromCanonicalId: 'file:a.ts',
      toCanonicalId: 'file:b.ts',
      relation: 'SEMANTIC_NEIGHBOR',
      workspaceRevision: 'workspace:W1',
      sourceRevision: 'source:S1',
      confidence: 0.84,
      evidenceRefs: ['knn:S1:1'],
      producerId: 'semantic-retrieval',
      producerRevision: 'semantic:1',
      derivedSimilarity: true,
      canonicalFact: false,
      canonicalWrites: false,
    });
    expect(relation.canonicalFact).toBe(false);
  });

  it('rejects an untyped semantic edge promoted as a canonical fact', () => {
    expect(() => RelatedFileRelationV1Schema.parse({
      schema: 'atlas.related-file-relation.v1',
      relationId: 'relation:2',
      fromCanonicalId: 'file:a.ts',
      toCanonicalId: 'file:b.ts',
      relation: 'SEMANTIC_NEIGHBOR',
      workspaceRevision: 'workspace:W1',
      sourceRevision: 'source:S1',
      confidence: 0.84,
      evidenceRefs: ['knn:S1:1'],
      producerId: 'semantic-retrieval',
      producerRevision: 'semantic:1',
      derivedSimilarity: false,
      canonicalFact: true,
      canonicalWrites: false,
    })).toThrow('semantic neighbors');
  });
});
