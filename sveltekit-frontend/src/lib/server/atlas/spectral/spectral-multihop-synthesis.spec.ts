import { describe, expect, it } from 'vitest';
import { DagMutationV1Schema } from './spectral-multihop-contracts.js';
import {
  cosineSimilarity,
  generationAffinity,
  harmonyScore,
  selectBoundedMutations,
  topology4Affinity,
} from './spectral-multihop-synthesis.js';

describe('spectral multihop synthesis', () => {
  it('treats q and -q as the same topology4 orientation', () => {
    expect(topology4Affinity([1, 0, 0, 0], [-1, 0, 0, 0])).toBeCloseTo(1, 8);
    expect(topology4Affinity([1, 0, 0, 0], [0, 1, 0, 0])).toBeCloseTo(0, 8);
  });

  it('keeps latent similarity advisory and bounded', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 8);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(0, 8);
  });

  it('rewards harmony across semantic, structural, and relational evidence', () => {
    const aligned = harmonyScore({
      semanticAffinity: 0.95,
      latent128Affinity: 0.9,
      latent64Affinity: 0.85,
      spectral4Affinity: 0.9,
      pagerank: 0.8,
      eigenvectorCentrality: 0.85,
      dagGenerationAffinity: 0.9,
      hyperedgeCoverage: 0.9,
      astAffinity: 0.9,
      exactPromotionCost: 0.1,
    });
    const semanticOnly = harmonyScore({
      semanticAffinity: 0.95,
      latent128Affinity: 0.9,
      latent64Affinity: 0.85,
      spectral4Affinity: 0,
      pagerank: 0,
      eigenvectorCentrality: 0,
      dagGenerationAffinity: 0,
      hyperedgeCoverage: 0,
      astAffinity: 0,
      exactPromotionCost: 0.1,
    });
    expect(aligned).toBeGreaterThan(semanticOnly);
  });

  it('selects only mutations fitting risk and VRAM budgets', () => {
    const base = {
      schema: 'atlas.dag-mutation.v1' as const,
      workflowId: 'wf-1',
      workflowRevision: 7,
      parentDagRevision: 'dag-r7',
      targetNodeIds: ['n1'],
      reasonCodes: ['VALIDATION_FAILED'],
      evidenceRefs: ['receipt:test'],
      requiresValidation: true as const,
    };
    const mutations = [
      DagMutationV1Schema.parse({
        ...base,
        mutationId: 'm1',
        mutationKind: 'RETRY_SUBGRAPH',
        expectedQualityGain: 0.8,
        estimatedLatencyMs: 100,
        estimatedVramBytes: 100,
        mutationRisk: 0.1,
      }),
      DagMutationV1Schema.parse({
        ...base,
        mutationId: 'm2',
        mutationKind: 'ESCALATE_SUBGRAPH',
        expectedQualityGain: 0.95,
        estimatedLatencyMs: 100,
        estimatedVramBytes: 500,
        mutationRisk: 0.8,
      }),
    ];
    const selected = selectBoundedMutations({
      mutations,
      maxMutations: 2,
      remainingVramBytes: 200,
      maxRisk: 0.5,
    });
    expect(selected.map((mutation) => mutation.mutationId)).toEqual(['m1']);
  });

  it('uses DAG generation distance as a bounded multihop affinity', () => {
    const makeRow = (generation: number) => ({
      canonicalId: `c-${generation}`,
      packetKey: `p-${generation}`,
      sourceRef: `f-${generation}`,
      ordinal: generation,
      generation,
      pagerank: null,
      eigenvectorCentrality: null,
      latent128: null,
      latent64: null,
      topology4: null,
    });
    expect(generationAffinity(makeRow(2), makeRow(2))).toBe(1);
    expect(generationAffinity(makeRow(2), makeRow(5))).toBeCloseTo(0.25, 8);
  });
});
