import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from './candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar } from './candidate-feature-columnar-v1.js';
import { runCandidateFeatureScatterSortCompactChallenger } from './candidate-feature-scatter-sort-compact-v1.js';

function fixtureColumnar() {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:scatter:v1',
    workspaceRevision: 'workspace:scatter:v1',
    producerRevision: 'ordinal-map:scatter:test',
    candidates: [
      { canonicalId: 'candidate:0', packetKey: 'packet:0', treeNodeId: 'tree:0', symbolVersionId: 'symbol:0', workspaceRevision: 'workspace:scatter:v1', sourceRevision: 'source:0', graphRevision: 'graph:scatter:v1', semanticRevision: 'semantic:scatter:v1', degradedIdentity: false, evidenceRefs: ['evidence:0'] },
      { canonicalId: 'candidate:1', packetKey: 'packet:1', treeNodeId: 'tree:1', symbolVersionId: 'symbol:1', workspaceRevision: 'workspace:scatter:v1', sourceRevision: 'source:1', graphRevision: 'graph:scatter:v1', semanticRevision: 'semantic:scatter:v1', degradedIdentity: false, evidenceRefs: ['evidence:1'] },
      { canonicalId: 'candidate:2', packetKey: 'packet:2', treeNodeId: 'tree:2', symbolVersionId: 'symbol:2', workspaceRevision: 'workspace:scatter:v1', sourceRevision: 'source:2', graphRevision: 'graph:scatter:v1', semanticRevision: 'semantic:scatter:v1', degradedIdentity: false, evidenceRefs: ['evidence:2'] },
    ],
  });
  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision: 'features:scatter:v1',
    producerRevision: 'feature-snapshot:scatter:test',
    rows: [0, 1, 2].map((candidateOrdinal) => ({
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal,
      canonicalId: `candidate:${candidateOrdinal}`,
      packetKey: `packet:${candidateOrdinal}`,
      treeNodeId: `tree:${candidateOrdinal}`,
      symbolVersionId: `symbol:${candidateOrdinal}`,
      workspaceRevision: 'workspace:scatter:v1',
      sourceRevision: `source:${candidateOrdinal}`,
      graphRevision: 'graph:scatter:v1',
      semanticRevision: 'semantic:scatter:v1',
      featureRevision: 'features:scatter:v1',
      semanticRelevance: [0.25, 0.9, 0.9][candidateOrdinal],
      lexicalRelevance: candidateOrdinal === 1 ? null : 0.1,
      astAffinity: null,
      graphAuthority: null,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: null,
      executionUtility: null,
      memoryUtility: null,
      laneMask: ['semantic'] as const,
      degradedIdentity: false,
      evidenceRefs: [`evidence:${candidateOrdinal}`],
    })),
  });
  return materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'columnar:scatter:test' });
}

describe('CandidateFeature scatter-sort-compact challenger', () => {
  it('scatters selected ordinals, sorts deterministically, and compacts top-K', () => {
    const first = runCandidateFeatureScatterSortCompactChallenger({
      columnar: fixtureColumnar(),
      selectedOrdinals: [2, 0, 1],
      sortFeature: 'semanticRelevance',
      sortDirection: 'DESC',
      topK: 2,
      producerRevision: 'scatter-sort-compact:test',
    });
    const second = runCandidateFeatureScatterSortCompactChallenger({
      columnar: fixtureColumnar(),
      selectedOrdinals: [2, 0, 1],
      sortFeature: 'semanticRelevance',
      sortDirection: 'DESC',
      topK: 2,
      producerRevision: 'scatter-sort-compact:test',
    });

    expect(first).toEqual(second);
    expect(first.scatterValidMask).toEqual([1, 1, 1]);
    expect(first.sortedOrdinals).toEqual([1, 2, 0]);
    expect(first.compactedOrdinals).toEqual([1, 2]);
    expect(first.compactedRowCount).toBe(2);
    expect(first.identityAuthority).toBe(false);
    expect(first.canonicalWritesAttempted).toBe(false);
  });

  it('uses ordinal order as the stable tie-break and preserves missing-value presence', () => {
    const result = runCandidateFeatureScatterSortCompactChallenger({
      columnar: fixtureColumnar(),
      selectedOrdinals: [2, 1, 0],
      sortFeature: 'lexicalRelevance',
      sortDirection: 'DESC',
      producerRevision: 'scatter-sort-compact:test',
    });

    expect(result.sortedOrdinals).toEqual([0, 2, 1]);
    const lexicalIndex = 1;
    expect(result.compactedFeaturePresence[lexicalIndex]).toBe(1);
    expect(result.compactedFeaturePresence[result.featureCount + lexicalIndex]).toBe(1);
    expect(result.compactedFeaturePresence[(2 * result.featureCount) + lexicalIndex]).toBe(0);
  });

  it('rejects duplicate or out-of-range ordinals before producing a challenger result', () => {
    expect(() => runCandidateFeatureScatterSortCompactChallenger({
      columnar: fixtureColumnar(), selectedOrdinals: [0, 0], sortFeature: 'semanticRelevance', producerRevision: 'scatter-sort-compact:test',
    })).toThrow('FEATURE_SCATTER_DUPLICATE_ORDINAL');
    expect(() => runCandidateFeatureScatterSortCompactChallenger({
      columnar: fixtureColumnar(), selectedOrdinals: [3], sortFeature: 'semanticRelevance', producerRevision: 'scatter-sort-compact:test',
    })).toThrow('FEATURE_SCATTER_ORDINAL_OUT_OF_RANGE');
  });
});
