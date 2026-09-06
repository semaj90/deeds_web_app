import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { materializeQueryFeaturesIntoCandidateSnapshotV1 } from './query-feature-to-candidate-feature-snapshot-v1.js';
import { buildLexicalFingerprintV1 } from '../agentic-file-compiler/lexical-fingerprint-v1.js';
import { buildQueryFingerprintV1 } from '../agentic-file-compiler/query-fingerprint-v1.js';

const hash = (letter: string) => letter.repeat(64);

function fixture() {
  const candidates = [
    { canonicalId: 'canonical:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', treeNodeId: 'tree:a', symbolVersionId: 'symbol:a', workspaceRevision: 'workspace:1', sourceRevision: 'source:a:1', graphRevision: 'graph:1', semanticRevision: 'semantic:768:1', degradedIdentity: false, evidenceRefs: ['evidence:a'] },
    { canonicalId: 'canonical:b', packetKey: 'packet:b', sourceRef: 'src/b.ts', treeNodeId: 'tree:b', symbolVersionId: 'symbol:b', workspaceRevision: 'workspace:1', sourceRevision: 'source:b:1', graphRevision: 'graph:1', semanticRevision: 'semantic:768:1', degradedIdentity: false, evidenceRefs: ['evidence:b'] },
  ];
  const ordinalMap = materializeCandidateOrdinalMap({ candidates, candidateSnapshotRevision: 'candidate:1', workspaceRevision: 'workspace:1', producerRevision: 'test:ordinal-map' });
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
    featureRevision: 'feature:query:1',
    representationBindings: [],
    semanticRelevance: 0.8,
    lexicalRelevance: 0.4,
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
    laneMask: ['semantic', 'lexical'] as ('semantic' | 'lexical')[],
    degradedIdentity: false,
    evidenceRefs: [`row:${candidate.candidateOrdinal}`],
  }));
  const queryFingerprint = buildQueryFingerprintV1({ requestId: 'query:1', query: 'TurboVec double vote', normalizerRevision: 'normalizer:1', corpusRevision: 'corpus:1', observedAt: '2026-09-06T00:00:00.000Z' });
  const lexicalFingerprintsByOrdinal = Object.fromEntries(ordinalMap.candidates.map((candidate) => [String(candidate.candidateOrdinal), buildLexicalFingerprintV1({
    candidateRef: candidate.canonicalId,
    sourceRef: candidate.sourceRef!,
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: candidate.workspaceRevision,
    lexicalFeatureRevision: 'lexical:1',
    corpusSnapshotChecksum: hash('a'),
    statistics: [{ term: 'retrieval', documentFrequency: 2, corpusFrequency: 4 }],
  })]));
  return { ordinalMap, rows, queryFingerprint, lexicalFingerprintsByOrdinal };
}

describe('query features to CandidateFeatureSnapshotV1', () => {
  it('joins exact query and lexical evidence without changing candidate membership', () => {
    const input = fixture();
    const result = materializeQueryFeaturesIntoCandidateSnapshotV1({ ...input, lexicalFeatureRevision: 'lexical:1', featureRevision: 'feature:query:1', producerRevision: 'query-feature-adapter:1' });
    expect(result.candidateOrdinals).toEqual([0, 1]);
    expect(result.snapshot.rows.map((row) => row.canonicalId)).toEqual(['canonical:a', 'canonical:b']);
    expect(result.snapshot.rows[0]?.evidenceRefs).toEqual(expect.arrayContaining([
      `query-fingerprint:${input.queryFingerprint.checksum}`,
      `lexical-fingerprint:${input.lexicalFingerprintsByOrdinal['0']!.checksum}`,
    ]));
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects missing and stale lexical feature joins', () => {
    const input = fixture();
    expect(() => materializeQueryFeaturesIntoCandidateSnapshotV1({
      ...input,
      lexicalFingerprintsByOrdinal: { '0': input.lexicalFingerprintsByOrdinal['0']! },
      lexicalFeatureRevision: 'lexical:1', featureRevision: 'feature:query:1', producerRevision: 'test:1',
    })).toThrow('QUERY_FEATURE_LEXICAL_MISSING:1');

    const stale = { ...input.lexicalFingerprintsByOrdinal['1']!, sourceRevision: 'source:b:stale' };
    expect(() => materializeQueryFeaturesIntoCandidateSnapshotV1({
      ...input,
      lexicalFingerprintsByOrdinal: { ...input.lexicalFingerprintsByOrdinal, '1': stale },
      lexicalFeatureRevision: 'lexical:1', featureRevision: 'feature:query:1', producerRevision: 'test:1',
    })).toThrow('QUERY_FEATURE_SOURCE_REVISION_MISMATCH:1');
  });
});
