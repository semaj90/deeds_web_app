import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from './candidate-feature-snapshot-v1.js';
import {
  filterCompactKnnTileOrdinalsV1,
  scoreCompactKnnTileWithOrdinalGateCpuV1,
} from '../retrieval/compact-knn-topk.js';
import {
  buildCandidateOrdinalBitsetSelectionV1,
  compileCandidateOrdinalBitsetGateV1,
  selectCandidateFeatureRowsWithOrdinalBitsetV1,
} from './candidate-ordinal-bitset-selection-v1.js';

const revision = (char: string) => `sha256:${char.repeat(64)}`;

function makeMap(snapshotRevision = revision('b')) {
  return materializeCandidateOrdinalMap({
    candidates: ['a', 'c', 'd'].map((suffix) => ({
      canonicalId: `canonical:${suffix}`,
      packetKey: `packet:${suffix}`,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: revision('a'),
      sourceRevision: revision(suffix),
      graphRevision: null,
      semanticRevision: null,
      degradedIdentity: false,
      evidenceRefs: [],
    })),
    candidateSnapshotRevision: snapshotRevision,
    workspaceRevision: revision('a'),
    producerRevision: 'ordinal-map-test:v1',
  });
}

function makeFeatureSnapshot(ordinalMap: ReturnType<typeof makeMap>) {
  const rows = ordinalMap.candidates.map((candidate) => ({
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    featureRevision: 'features:v1',
    semanticRelevance: 0.5,
    lexicalRelevance: 0.5,
    astAffinity: 0,
    graphAuthority: 0,
    personalizedPageRank: null,
    communityAffinity: null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: null,
    executionUtility: null,
    memoryUtility: null,
    laneMask: ['semantic'] as ('semantic' | 'lexical' | 'ast' | 'graph' | 'domain')[],
    degradedIdentity: candidate.degradedIdentity,
    evidenceRefs: [`evidence:${candidate.candidateOrdinal}`],
  }));
  return materializeCandidateFeatureSnapshot({
    ordinalMap,
    rows,
    featureRevision: 'features:v1',
    producerRevision: 'feature-snapshot-test:v1',
  });
}

describe('CandidateOrdinalBitsetSelectionV1', () => {
  it('uses a serialized bitset to select only rows from the exact frozen ordinal map', () => {
    const ordinalMap = makeMap();
    const featureSnapshot = makeFeatureSnapshot(ordinalMap);
    const selection = buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [2, 0] });

    const selected = selectCandidateFeatureRowsWithOrdinalBitsetV1({ ordinalMap, featureSnapshot, selection });
    expect(selected.map((row) => row.candidateOrdinal)).toEqual([0, 2]);
    expect(selected.map((row) => row.packetKey)).toEqual(['packet:a', 'packet:d']);
  });

  it('rejects a bitset reused against a different ordinal map', () => {
    const ordinalMap = makeMap();
    const selection = buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [1] });

    expect(() => selectCandidateFeatureRowsWithOrdinalBitsetV1({
      ordinalMap: makeMap(revision('e')),
      featureSnapshot: makeFeatureSnapshot(makeMap(revision('e'))),
      selection,
    })).toThrow('ORDINAL_BITSET_SELECTION_MAP_MISMATCH');
  });

  it('rejects tampered serialized bytes and invalid ordinals', () => {
    const ordinalMap = makeMap();
    const featureSnapshot = makeFeatureSnapshot(ordinalMap);
    const selection = buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [1] });
    const tampered = Buffer.from(selection.bytea);
    tampered[tampered.length - 1] ^= 1;

    expect(() => selectCandidateFeatureRowsWithOrdinalBitsetV1({
      ordinalMap,
      featureSnapshot,
      selection: { ...selection, bytea: tampered },
    })).toThrow('ORDINAL_BITSET_SELECTION_SHA256_MISMATCH');
    expect(() => buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [3] }))
      .toThrow('ORDINAL_BITSET_SELECTION_OUT_OF_RANGE:3');
  });

  it('filters the complete KNN tile before score gather and Top-K truncation', () => {
    const ordinalMap = makeMap();
    const selection = buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [0, 2] });
    const gate = compileCandidateOrdinalBitsetGateV1({ ordinalMap, selection });

    const tile = filterCompactKnnTileOrdinalsV1({
      candidateOrdinals: [0, 1, 2],
      tileCandidateCount: 3,
      candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
      workspaceRevision: ordinalMap.workspaceRevision,
      ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
      gate,
    });
    expect([...tile.candidateOrdinals]).toEqual([0, 2]);
    expect(tile.eligibleTileCandidateCount).toBe(2);
    expect(tile.excludedTileCandidateCount).toBe(1);
    expect(gate.eligibleCount).toBe(2);
    expect(() => gate.filterTileOrdinals([0, 1], 3)).toThrow('ORDINAL_BITSET_KNN_TILE_INCOMPLETE');
  });

  it('applies the frozen ordinal mask before reading candidate vectors and scoring Top-K', () => {
    const ordinalMap = makeMap();
    const selection = buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [0, 2] });
    const gate = compileCandidateOrdinalBitsetGateV1({ ordinalMap, selection });

    const result = scoreCompactKnnTileWithOrdinalGateCpuV1({
      candidateOrdinals: [0, 1, 2],
      tileCandidateCount: 3,
      candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
      workspaceRevision: ordinalMap.workspaceRevision,
      ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
      gate,
      queryVector: new Float32Array([1, 0]),
      candidateVectors: new Float32Array([1, 0, Number.NaN, Number.NaN, 0.8, 0.6]),
      canonicalIdsByOrdinal: ordinalMap.candidates.map((candidate) => candidate.canonicalId),
      queryOrdinal: 0,
      k: 1,
      metric: 'COSINE_SIMILARITY',
    });

    expect(result.localTopK).toEqual([{
      queryOrdinal: 0,
      candidateOrdinal: 0,
      canonicalId: 'canonical:a',
      value: 1,
    }]);
    expect(result.eligibleTileCandidateCount).toBe(2);
    expect(result.excludedTileCandidateCount).toBe(1);
  });
});
