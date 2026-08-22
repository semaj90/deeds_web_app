import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from './candidate-feature-snapshot-v1.js';
import {
  CANDIDATE_LANE_BITS,
  CANDIDATE_SCALAR_FEATURES,
  materializeCandidateFeatureColumnar,
} from './candidate-feature-columnar-v1.js';

function fixtureSnapshot() {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:v1',
    workspaceRevision: 'workspace:v1',
    producerRevision: 'ordinal-map:test',
    candidates: [
      {
        canonicalId: 'candidate:b',
        packetKey: 'packet:b',
        treeNodeId: 'tree:b',
        symbolVersionId: 'symbol:b',
        workspaceRevision: 'workspace:v1',
        sourceRevision: 'source:b',
        graphRevision: 'graph:v1',
        semanticRevision: 'semantic:v1',
        degradedIdentity: false,
        evidenceRefs: ['evidence:b'],
      },
      {
        canonicalId: 'candidate:a',
        packetKey: 'packet:a',
        treeNodeId: 'tree:a',
        symbolVersionId: 'symbol:a',
        workspaceRevision: 'workspace:v1',
        sourceRevision: 'source:a',
        graphRevision: 'graph:v1',
        semanticRevision: 'semantic:v1',
        degradedIdentity: false,
        evidenceRefs: ['evidence:a'],
      },
    ],
  });

  return materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision: 'features:v1',
    producerRevision: 'feature-snapshot:test',
    rows: [
      {
        schema: 'atlas.candidate-feature-row.v1',
        candidateOrdinal: 1,
        canonicalId: 'candidate:b',
        packetKey: 'packet:b',
        treeNodeId: 'tree:b',
        symbolVersionId: 'symbol:b',
        workspaceRevision: 'workspace:v1',
        sourceRevision: 'source:b',
        graphRevision: 'graph:v1',
        semanticRevision: 'semantic:v1',
        featureRevision: 'features:v1',
        semanticRelevance: 0.75,
        lexicalRelevance: 0,
        astAffinity: null,
        graphAuthority: 0.4,
        personalizedPageRank: null,
        communityAffinity: null,
        manifold4OrientationSimilarity: null,
        crossEncoderRawScore: null,
        crossEncoderCalibratedScore: null,
        crossEncoderAvailable: false,
        domainAffinity: null,
        executionUtility: null,
        memoryUtility: null,
        laneMask: ['semantic', 'lexical', 'graph'],
        degradedIdentity: false,
        evidenceRefs: ['evidence:b'],
      },
      {
        schema: 'atlas.candidate-feature-row.v1',
        candidateOrdinal: 0,
        canonicalId: 'candidate:a',
        packetKey: 'packet:a',
        treeNodeId: 'tree:a',
        symbolVersionId: 'symbol:a',
        workspaceRevision: 'workspace:v1',
        sourceRevision: 'source:a',
        graphRevision: 'graph:v1',
        semanticRevision: 'semantic:v1',
        featureRevision: 'features:v1',
        semanticRelevance: 1,
        lexicalRelevance: null,
        astAffinity: 0.25,
        graphAuthority: null,
        personalizedPageRank: null,
        communityAffinity: null,
        manifold4OrientationSimilarity: null,
        crossEncoderRawScore: null,
        crossEncoderCalibratedScore: null,
        crossEncoderAvailable: false,
        domainAffinity: 0.5,
        executionUtility: null,
        memoryUtility: 0,
        laneMask: ['semantic', 'ast', 'domain', 'memory'],
        degradedIdentity: false,
        evidenceRefs: ['evidence:a'],
      },
    ],
  });
}

describe('CandidateFeatureColumnarV1', () => {
  it('compiles logical rows into deterministic portable columnar buffers', () => {
    const snapshot = fixtureSnapshot();
    const a = materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'columnar:test' });
    const b = materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'columnar:test' });

    expect(a).toEqual(b);
    expect(a.candidateOrdinals).toEqual([0, 1]);
    expect(a.canonicalIds).toEqual(['candidate:a', 'candidate:b']);
    expect(a.featureCount).toBe(CANDIDATE_SCALAR_FEATURES.length);
    expect(a.featureValues).toHaveLength(2 * CANDIDATE_SCALAR_FEATURES.length);
    expect(a.featurePresence).toHaveLength(a.featureValues.length);
    expect(a.byteOrder).toBe('little-endian');
    expect(a.featureDtype).toBe('float32');
    expect(a.logicalRowsOnly).toBe(true);
    expect(a.identityAuthority).toBe(false);
  });

  it('distinguishes a real numeric zero from missing evidence', () => {
    const columnar = materializeCandidateFeatureColumnar({
      snapshot: fixtureSnapshot(),
      producerRevision: 'columnar:test',
    });
    const lexicalIndex = CANDIDATE_SCALAR_FEATURES.indexOf('lexicalRelevance');
    const memoryIndex = CANDIDATE_SCALAR_FEATURES.indexOf('memoryUtility');
    const width = CANDIDATE_SCALAR_FEATURES.length;

    // candidate:a lexical is missing, but memoryUtility is an actual numeric zero.
    expect(columnar.featureValues[lexicalIndex]).toBe(0);
    expect(columnar.featurePresence[lexicalIndex]).toBe(0);
    expect(columnar.featureValues[memoryIndex]).toBe(0);
    expect(columnar.featurePresence[memoryIndex]).toBe(1);

    // candidate:b lexical is an actual numeric zero.
    expect(columnar.featureValues[width + lexicalIndex]).toBe(0);
    expect(columnar.featurePresence[width + lexicalIndex]).toBe(1);
  });

  it('encodes lane membership as a stable uint16 bit mask', () => {
    const columnar = materializeCandidateFeatureColumnar({
      snapshot: fixtureSnapshot(),
      producerRevision: 'columnar:test',
    });

    expect(columnar.laneMaskU16[0]).toBe(
      CANDIDATE_LANE_BITS.semantic |
      CANDIDATE_LANE_BITS.ast |
      CANDIDATE_LANE_BITS.domain |
      CANDIDATE_LANE_BITS.memory,
    );
    expect(columnar.laneMaskU16[1]).toBe(
      CANDIDATE_LANE_BITS.semantic |
      CANDIDATE_LANE_BITS.lexical |
      CANDIDATE_LANE_BITS.graph,
    );
  });

  it('fails before physical materialization when the logical snapshot checksum is tampered', () => {
    const snapshot = fixtureSnapshot();
    const tampered = {
      ...snapshot,
      rows: snapshot.rows.map((row, index) => index === 0 ? { ...row, semanticRelevance: 0.123 } : row),
    };

    expect(() => materializeCandidateFeatureColumnar({
      snapshot: tampered,
      producerRevision: 'columnar:test',
    })).toThrow(/FEATURE_SNAPSHOT_CHECKSUM_MISMATCH/);
  });
});
