import { describe, expect, it } from 'vitest';
import { buildStructuralIdentity } from './structural-identity-v1.js';
import { buildRetrievalFanoutPlan, buildStructuralHyperedge } from './structural-hypergraph-fanout.js';

const locator = {
  schema: 'atlas.ast-node-locator.v1' as const,
  workspaceRevision: 'ws:742',
  sourceRevision: 'src:18',
  sourceRef: 'src/lib/search.ts',
  parserName: 'treesitter-chunker',
  parserVersion: '1.0.0',
  grammarRevision: 'tree-sitter-typescript:r1',
  language: 'typescript',
  nodeType: 'function_declaration',
  nodeKind: 'function',
  named: true,
  rawAstPath: [3, 2, 1],
  namedAstPath: [2, 1, 0],
  parentRawAstPath: [3, 2],
  parentNamedAstPath: [2, 1],
  parentNodeType: 'program',
  childIndex: 1,
  namedChildIndex: 0,
  depth: 3,
  span: { startByte: 100, endByte: 240, startLine: 8, startColumn: 0, endLine: 14, endColumn: 1 },
  qualifiedSymbol: 'search',
  normalizedSignature: 'search(query:string):Promise<Result[]>',
};

describe('Parent Atlas structural routing', () => {
  it('derives deterministic revision-local and stable structural identities', () => {
    const first = buildStructuralIdentity({ locator, producerRevision: 'struct:r1' });
    const second = buildStructuralIdentity({ locator, producerRevision: 'struct:r1' });
    expect(first.astNodeId).toBe(second.astNodeId);
    expect(first.symbolId).toBe(second.symbolId);
    expect(first.symbolVersionId).toBe(second.symbolVersionId);
    expect(first.astNodeId).not.toBe(first.symbolId);
  });

  it('keeps n-ary events as one hyperedge rather than flattening identity', () => {
    const edge = buildStructuralHyperedge({
      type: 'TYPE_CONSTRAINT',
      workspaceRevision: 'ws:742',
      sourceRevision: 'src:18',
      graphRevision: 'graph:338',
      representationRevision: 'semantic_768:r1',
      participants: [
        { entityId: 'ast:T8421', entityKind: 'ast_node', role: 'ast_node', ordinal: 0 },
        { entityId: 'symv:S331', entityKind: 'symbol_version', role: 'symbol_version', ordinal: 1 },
        { entityId: 'type:string', entityKind: 'type', role: 'observed_type', ordinal: 2 },
        { entityId: 'type:number', entityKind: 'type', role: 'expected_type', ordinal: 3 },
        { entityId: 'diag:TS2345', entityKind: 'diagnostic', role: 'diagnostic', ordinal: 4 },
      ],
      evidenceRefs: ['src/lib/search.ts#L8-L14'],
      confidence: 1,
      producerRevision: 'graphify:r1',
    });
    expect(edge.participants).toHaveLength(5);
    expect(edge.hyperedgeId).toMatch(/^hyper:/);
  });

  it('routes via SOM/KMeans but performs graph fanout only after narrowing', () => {
    const plan = buildRetrievalFanoutPlan({
      requestId: 'req:1',
      workspaceRevision: 'ws:742',
      graphRevision: 'graph:338',
      representationRevision: 'semantic_768:r1',
      taskKind: 'compile_error_repair',
      somCell: { x: 12, y: 7, revision: 'som:12' },
      neighboringSomCells: [{ x: 12, y: 7 }, { x: 12, y: 8 }, { x: 13, y: 8 }],
      kmeansCentroidIds: ['centroid:18', 'centroid:41'],
      kmeansRevision: 'kmeans:9',
      cuvsExactAvailable: true,
    });
    expect(plan.semanticLane.oneLogicalVote).toBe(true);
    expect(plan.semanticLane.executors).toContain('QDRANT');
    expect(plan.semanticLane.executors).toContain('CUVS_EXACT');
    expect(plan.graphFanout.seedK).toBeLessThan(plan.semanticLane.candidateK);
    expect(plan.graphFanout.maxDepth).toBe(2);
  });
});
