import { describe, expect, it } from 'vitest';
import { adaptGpuFeatureEnrichmentV1, gpuFeatureBundleToAceCardsV1 } from './gpu-feature-enrichment-adapter-v1.js';
import { aceCardsToFanoutEvidenceBundleV1 } from '../context/gpu-feature-ace-context-adapter-v1.js';

const h = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;

function response() {
  return {
    status: 'GPU_TILE_GRAPH_FEATURE_ENRICHMENT_PROVEN_BOUNDED', artifactChecksum: h('a'), graphRevision: h('b'), featureRevision: 'graph-r1', candidateCount: 2, graphFeaturePresentCount: 1, graphFeatureAbsentCount: 1,
    rows: [
      { candidateOrdinal: 1, graphFeaturePresent: true, pagerankMax: 0.2, pagerankMean: 0.1, pagerankSum: 0.2, graphNodeCount: 2, presence: { pagerank: 1, graphNodeCount: 1 } },
      { candidateOrdinal: 0, graphFeaturePresent: false, pagerankMax: null, pagerankMean: null, pagerankSum: null, graphNodeCount: null, presence: { pagerank: 0, graphNodeCount: 0 } },
    ], rankingPromotion: false, logicalLaneVote: 'NONE', canonicalAuthority: false, writes: { postgres: false, qdrant: false, valkey: false },
  };
}

describe('GPU feature enrichment adapter V1', () => {
  it('sorts and binds a bounded response to snapshot identity', () => {
    const result = adaptGpuFeatureEnrichmentV1({ response: response(), candidateSnapshotRevision: 'snapshot-r1', ordinalMapChecksum: h('c'), expectedCandidateOrdinals: [0, 1] });
    expect(result.rows.map((row) => row.candidateOrdinal)).toEqual([0, 1]);
    expect(result.candidateSnapshotRevision).toBe('snapshot-r1');
    expect(result.rankingPromotion).toBe(false);
    expect(result.bundleChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects unknown candidate ordinals', () => {
    expect(() => adaptGpuFeatureEnrichmentV1({ response: response(), candidateSnapshotRevision: 'snapshot-r1', ordinalMapChecksum: h('c'), expectedCandidateOrdinals: [0, 2] })).toThrow('GPU_FEATURE_CANDIDATE_ORDINAL_MISMATCH');
  });

  it('emits ACE cards only for observed graph rows', () => {
    const bundle = adaptGpuFeatureEnrichmentV1({ response: response(), candidateSnapshotRevision: 'snapshot-r1', ordinalMapChecksum: h('c'), expectedCandidateOrdinals: [0, 1] });
    const cards = gpuFeatureBundleToAceCardsV1({ bundle, workspaceRevision: h('e'), candidates: [{ candidateOrdinal: 0, packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: h('d'), workspaceRevision: h('e') }, { candidateOrdinal: 1, packetKey: 'packet:b', sourceRef: 'src/b.ts', sourceRevision: h('f'), workspaceRevision: h('e') }] });
    expect(cards).toHaveLength(1);
    expect(cards[0].candidateOrdinal).toBe(1);
    expect(cards[0].cardKind).toBe('GRAPH');
  });

  it('converts selected cards into revision-bound fanout input', () => {
    const bundle = adaptGpuFeatureEnrichmentV1({ response: response(), candidateSnapshotRevision: 'snapshot-r1', ordinalMapChecksum: h('c'), expectedCandidateOrdinals: [0, 1] });
    const cards = gpuFeatureBundleToAceCardsV1({ bundle, workspaceRevision: h('e'), candidates: [{ candidateOrdinal: 0, packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: h('d'), workspaceRevision: h('e') }, { candidateOrdinal: 1, packetKey: 'packet:b', sourceRef: 'src/b.ts', sourceRevision: h('f'), workspaceRevision: h('e') }] });
    const fanout = aceCardsToFanoutEvidenceBundleV1({ cards, workspaceRevision: h('e'), candidateSnapshotRevision: 'snapshot-r1', ordinalMapChecksum: h('c'), tokenizerRevision: 'tokenizer-r1', tokenBudget: 300, edgePolicyRevision: 'edge-r1', maxHopDepth: 0, representationRevisions: { semantic_768: 'semantic-r1' } });
    expect(fanout.candidates).toHaveLength(1);
    expect(fanout.candidates[0].candidateOrdinal).toBe(1);
    expect(fanout.summary.evidenceOrder).toHaveLength(1);
    expect(fanout.bundleChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
