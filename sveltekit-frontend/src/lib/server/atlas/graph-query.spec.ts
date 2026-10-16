import { describe, expect, it } from 'vitest';
import { AtlasGraphQueryRuntime } from './graph-query-runtime.js';
import { graphQuerySchema } from './graph-query-contract.js';

describe('Unified Graph Query Boundary (atlas.graph.query)', () => {
  const runtime = new AtlasGraphQueryRuntime();

  it('validates schema bounds and rejects negative topK or excessive maxHops', () => {
    expect(() =>
      graphQuerySchema.parse({
        operation: 'topk',
        query: 'find functions',
        topK: -5,
        workspaceRevision: 'ws-rev-1',
        graphRevision: 'graph-rev-1',
        requestId: '11111111-1111-4111-8111-111111111111',
      })
    ).toThrow();

    expect(() =>
      graphQuerySchema.parse({
        operation: 'topk',
        query: 'find functions',
        maxHops: 10, // max is 4
        workspaceRevision: 'ws-rev-1',
        graphRevision: 'graph-rev-1',
        requestId: '11111111-1111-4111-8111-111111111111',
      })
    ).toThrow();
  });

  it('executes direct topk query and returns bounded ranked candidates with zero writes', async () => {
    const res = await runtime.query({
      operation: 'topk',
      query: 'postgres exact retriever',
      topK: 10,
      maxHops: 2,
      workspaceRevision: 'ws-rev-1',
      graphRevision: 'graph-rev-1',
      requestId: '11111111-1111-4111-8111-111111111111',
    });

    expect(res.schema).toBe('atlas.graph-query-result.v1');
    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.writesPerformed).toBe(false);
    expect(res.kvCachePersisted).toBe(false);
    expect(res.candidates[0]!.canonicalId).toBe('canonical:postgres-exact-retriever');
  });

  it('executes ontology operation via Python OAKLIB helper and binds typed ancestor tuples', async () => {
    const res = await runtime.query({
      operation: 'ontology',
      query: 'code:ExactRetriever',
      topK: 10,
      predicates: ['ancestors'],
      workspaceRevision: 'ws-rev-1',
      graphRevision: 'graph-rev-1',
      ontologyRevision: 'atlas.ontology.v1',
      requestId: '22222222-2222-4222-8222-222222222222',
    });

    expect(res.operation).toBe('ontology');
    expect(res.candidates.length).toBe(1);
    expect(res.candidates[0]!.tuples.length).toBe(1);
    const tuple = res.candidates[0]!.tuples[0]!;
    expect(tuple.subject).toBe('code:ExactRetriever');
    expect(tuple.predicate).toBe('rdfs:subClassOf');
    expect(tuple.object).toBe('code:Retriever');
    expect(tuple.provenance.source).toBe('oaklib');
    expect(tuple.provenance.relationKind).toBe('ancestor');
  });
});
