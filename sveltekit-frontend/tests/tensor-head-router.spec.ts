import { describe, expect, it } from 'vitest';
import { buildTensorHeadRoute } from '$lib/server/atlas/runtime/tensor-head-router.js';

const heads = [
  {
    headId: 'deterministic-domain',
    executor: 'typescript_cpu',
    taskClasses: ['DOMAIN_CLASSIFICATION'] as const,
    requiredSignals: ['semantic', 'ontology'],
    optionalSignals: ['pagerank'],
    basePrior: 0.7,
  },
  {
    headId: 'pytorch-domain-shadow',
    executor: 'pytorch_cuda',
    modelRevision: 'domain-head:v1',
    taskClasses: ['DOMAIN_CLASSIFICATION'] as const,
    requiredSignals: ['semantic', 'ontology', 'pos'],
    optionalSignals: ['hypergraph'],
    basePrior: 0.6,
  },
];

describe('buildTensorHeadRoute', () => {
  it('records which deterministic head was actually selected', () => {
    const route = buildTensorHeadRoute({
      requestId: 'r1', taskClass: 'DOMAIN_CLASSIFICATION', featureSnapshotRef: 'feature:s1', featureRevision: 'f1',
      representationRevision: 'semantic_768:v1', routerRevision: 'router:v1', routingMode: 'DETERMINISTIC_RULES',
      decisionFunction: 'ARGMAX', topK: 1, seed: 'seed', candidates: heads as any,
      signals: { semantic: .9, ontology: .8, pagerank: .4, pos: .7, hypergraph: .5 },
    });
    expect(route.selectedHeads).toHaveLength(1);
    expect(route.selectedHeads[0]?.headId).toBe('deterministic-domain');
    expect(route.canonicalWrites).toBe(false);
  });

  it('keeps PyTorch MoE routing shadow-only', () => {
    const route = buildTensorHeadRoute({
      requestId: 'r2', taskClass: 'DOMAIN_CLASSIFICATION', featureSnapshotRef: 'feature:s2', featureRevision: 'f2',
      representationRevision: 'semantic_768:v1', routerRevision: 'router:v2', routingMode: 'PYTORCH_MOE_SHADOW',
      decisionFunction: 'TOPK', topK: 2, seed: 'seed', candidates: heads as any,
      signals: { semantic: .9, ontology: .8, pos: .9, pagerank: .4, hypergraph: .7 },
      geometrySignals: ['SIGNED_S3', 'JACOBIAN_DIAGNOSTIC'],
    });
    expect(route.selectedHeads).toEqual([]);
    expect(route.shadowHeads.length).toBeGreaterThan(0);
  });

  it('does not coerce a missing required signal to zero', () => {
    expect(() => buildTensorHeadRoute({
      requestId: 'r3', taskClass: 'DOMAIN_CLASSIFICATION', featureSnapshotRef: 'feature:s3', featureRevision: 'f3',
      representationRevision: 'semantic_768:v1', routerRevision: 'router:v1', routingMode: 'DETERMINISTIC_RULES',
      decisionFunction: 'ARGMAX', topK: 1, seed: 'seed', candidates: [heads[1]] as any,
      signals: { semantic: .9, ontology: .8, pos: null },
    })).toThrow(/required observed signals/);
  });
});
