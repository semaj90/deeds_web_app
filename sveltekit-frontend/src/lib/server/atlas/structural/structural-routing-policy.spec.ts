import { describe, expect, it } from 'vitest';
import { buildAstTraversalPlan } from './ast-relational-selector.js';
import { buildStructuralHyperedge } from './structural-hypergraph-fanout.js';
import { buildStructuralRoutingDecision } from './structural-routing-policy.js';

describe('Parent Atlas structural routing', () => {
  it('builds bounded named-node traversal for repair intent', () => {
    const plan = buildAstTraversalPlan({
      requestId: 'req:1',
      intent: 'fix TypeScript compile error in argument type',
      seed: {
        canonicalId: 'sym:1',
        symbolVersionId: 'sv:1',
        treeNodeId: 'ast:1',
        workspaceRevision: 'ws:1',
        sourceRevision: 'src:1',
        graphRevision: 'graph:1',
        sourceRef: 'src/a.ts',
      },
    });

    expect(plan.execution.namedNodesFirst).toBe(true);
    expect(plan.execution.maxVisitedNodes).toBeLessThanOrEqual(1024);
    expect(plan.selector.relation).toBe('ANCESTOR');
    expect(plan.selector.has?.relation).toBe('TYPE_OF');
  });

  it('routes KMeans/SOM before bounded graph fanout and preserves n-ary evidence', () => {
    const hyperedge = buildStructuralHyperedge({
      type: 'TYPE_CONSTRAINT',
      workspaceRevision: 'ws:1',
      sourceRevision: 'src:1',
      graphRevision: 'graph:1',
      representationRevision: 'semantic_768:r1',
      confidence: 0.93,
      producerRevision: 'producer:1',
      evidenceRefs: ['src:a.ts#L1-L3'],
      participants: [
        { entityId: 'sym:1', entityKind: 'symbol', role: 'symbol', ordinal: 0 },
        { entityId: 'ast:1', entityKind: 'ast_node', role: 'ast_node', ordinal: 1 },
        { entityId: 'arg:1', entityKind: 'argument', role: 'argument', ordinal: 2 },
        { entityId: 'type:expected', entityKind: 'type', role: 'expected_type', ordinal: 3 },
        { entityId: 'type:observed', entityKind: 'type', role: 'observed_type', ordinal: 4 },
      ],
    });

    const decision = buildStructuralRoutingDecision({
      requestId: 'req:1',
      workspaceRevision: 'ws:1',
      graphRevision: 'graph:1',
      representationRevision: 'semantic_768:r1',
      taskKind: 'repair compile failure',
      somCell: { x: 12, y: 7, revision: 'som:r1' },
      neighboringSomCells: [{ x: 12, y: 8 }],
      kmeansCentroidIds: ['centroid:7', 'centroid:9'],
      kmeansRevision: 'kmeans:r1',
      qdrantAvailable: true,
      hyperedges: [hyperedge],
      candidates: [{
        canonicalId: 'sym:1',
        packetKey: 'packet:1',
        symbolVersionId: 'sv:1',
        treeNodeId: 'ast:1',
        sourceRef: 'src/a.ts',
        workspaceRevision: 'ws:1',
        sourceRevision: 'src:1',
        graphRevision: 'graph:1',
        representationRevision: 'semantic_768:r1',
        semanticScore: 0.91,
        lexicalScore: 0.4,
        astScore: 0.88,
        graphScore: 0.72,
        executionScore: 0.9,
        domainScore: 0.8,
        kmeansCentroidId: 'centroid:7',
        somCell: { x: 12, y: 7 },
        evidenceRefs: ['src:a.ts#L1-L3'],
      }],
    });

    expect(decision.fanoutPlan.semanticLane.oneLogicalVote).toBe(true);
    expect(decision.fanoutPlan.graphFanout.maxDepth).toBeLessThanOrEqual(2);
    expect(decision.seedCanonicalIds).toEqual(['sym:1']);
    expect(decision.selectedHyperedgeIds).toEqual([hyperedge.hyperedgeId]);
  });
});
