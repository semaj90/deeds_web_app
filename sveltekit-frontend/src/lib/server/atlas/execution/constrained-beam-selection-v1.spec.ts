import { describe, expect, it } from 'vitest';
import {
  constrainedBeamSelect,
  estimateGpuWorkingSet,
} from './constrained-beam-selection-v1.js';

const envelope = {
  maxVramBytes: 512 * 1024 * 1024,
  maxContextTokens: 8192,
  maxCandidates: 4,
  maxGraphHops: 2,
  maxHyperedges: 2,
  maxToolCalls: 4,
  maxWallMs: 5_000,
};

describe('estimateGpuWorkingSet', () => {
  it('accounts for semantic, feature, graph, incidence and scratch memory', () => {
    const estimate = estimateGpuWorkingSet({
      candidateRows: 100,
      semanticDimensions: 768,
      semanticBytesPerElement: 2,
      featureColumns: 16,
      featureBytesPerElement: 4,
      graphVertices: 1_000,
      graphEdges: 5_000,
      hyperedgeIncidences: 2_000,
      fixedOverheadBytes: 64 * 1024 * 1024,
      scratchMultiplier: 1.5,
    });

    expect(estimate.semanticBytes).toBe(153_600);
    expect(estimate.featureBytes).toBe(6_400);
    expect(estimate.graphBytes).toBe(88_000);
    expect(estimate.incidenceBytes).toBe(48_000);
    expect(estimate.estimatedBytes).toBeGreaterThan(estimate.baseBytes);
  });
});

describe('constrainedBeamSelect', () => {
  it('keeps high PageRank hubs from violating fanout and VRAM constraints', () => {
    const result = constrainedBeamSelect({
      requestId: 'beam-test-1',
      revisionSetHash: '11111111111111112222222222222222',
      seed: 7,
      beamWidth: 16,
      maxSelections: 4,
      envelope,
      gpu: {
        freeVramBytes: 96 * 1024 * 1024,
        reservedHeadroomBytes: 32 * 1024 * 1024,
        telemetryProven: true,
        deviceName: 'test-gpu',
      },
      candidates: [
        {
          canonicalId: 'hub',
          family: 'entity',
          executionClass: 'GPU',
          scores: { pagerank: 1, ppr: 1, semantic: 1 },
          cost: { candidateUnits: 1, fanoutUnits: 100, gpuBytes: 80 * 1024 * 1024 },
        },
        {
          canonicalId: 'relation-a',
          family: 'relationship',
          scores: { ppr: 0.9, incidenceConfidence: 1 },
          cost: { candidateUnits: 1, hyperedgeUnits: 1, fanoutUnits: 2, gpuBytes: 8 * 1024 * 1024 },
        },
        {
          canonicalId: 'evidence-a',
          family: 'evidence',
          scores: { exact: 1, reranker: 0.9 },
          cost: { candidateUnits: 1, fanoutUnits: 0, gpuBytes: 4 * 1024 * 1024 },
        },
      ],
      familyQuotas: [
        { family: 'relationship', min: 1 },
        { family: 'evidence', min: 1 },
      ],
    });

    expect(result.selectedCanonicalIds).not.toContain('hub');
    expect(result.selectedCanonicalIds).toContain('relation-a');
    expect(result.selectedCanonicalIds).toContain('evidence-a');
    expect(result.quotaSatisfied).toBe(true);
    expect(result.effectiveGpuBudgetBytes).toBe(64 * 1024 * 1024);
  });

  it('is replayable when seeded exploration is enabled', () => {
    const request = {
      requestId: 'beam-test-2',
      revisionSetHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      seed: 0xA71A5,
      beamWidth: 8,
      maxSelections: 2,
      explorationWeight: 0.1,
      envelope,
      candidates: ['a', 'b', 'c'].map((canonicalId) => ({
        canonicalId,
        family: 'entity' as const,
        scores: { semantic: 0.5 },
        cost: { candidateUnits: 1 },
      })),
    };

    const first = constrainedBeamSelect(request);
    const second = constrainedBeamSelect(request);

    expect(second.selectedCanonicalIds).toEqual(first.selectedCanonicalIds);
    expect(second.checksum).toBe(first.checksum);
    expect(first.reasonCodes).toContain('SEEDED_EXPLORATION_ENABLED');
  });

  it('fails closed for a GPU-only candidate when no GPU budget is established', () => {
    const result = constrainedBeamSelect({
      requestId: 'beam-test-3',
      revisionSetHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      beamWidth: 4,
      maxSelections: 1,
      envelope: { ...envelope, maxVramBytes: 0 },
      candidates: [
        {
          canonicalId: 'gpu-only',
          family: 'entity',
          executionClass: 'GPU',
          scores: { semantic: 1 },
          cost: { candidateUnits: 1, gpuBytes: 1 },
        },
      ],
    });

    expect(result.status).toBe('EMPTY');
    expect(result.reasonCodes).toContain('NO_FEASIBLE_CANDIDATE');
  });
});
