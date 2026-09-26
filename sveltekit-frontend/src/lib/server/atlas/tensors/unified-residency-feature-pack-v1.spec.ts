import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar } from '../features/candidate-feature-columnar-v1.js';
import { materializeCandidateFeatureGpuPack } from '../features/candidate-feature-gpu-pack-v1.js';
import { loadUnifiedResidencyFeaturePackV1, prepareUnifiedResidencyFeaturePackBatchV1, prepareUnifiedResidencyFeaturePackV1 } from './unified-residency-feature-pack-v1.js';

function makePack(sourceRevisions: string[]) {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate:pack:v1', workspaceRevision: 'workspace:pack:v1', producerRevision: 'producer:pack:v1',
    candidates: sourceRevisions.map((sourceRevision, candidateOrdinal) => ({
      canonicalId: `candidate:${candidateOrdinal}`, packetKey: `packet:${candidateOrdinal}`, treeNodeId: `tree:${candidateOrdinal}`,
      symbolVersionId: `symbol:${candidateOrdinal}`, workspaceRevision: 'workspace:pack:v1', sourceRevision,
      graphRevision: null, semanticRevision: 'semantic:v1', degradedIdentity: false, evidenceRefs: [`evidence:${candidateOrdinal}`],
    })),
  });
  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap, featureRevision: 'feature:pack:v1', producerRevision: 'producer:pack:v1',
    rows: sourceRevisions.map((sourceRevision, candidateOrdinal) => ({
      schema: 'atlas.candidate-feature-row.v1', candidateOrdinal, canonicalId: `candidate:${candidateOrdinal}`,
      packetKey: `packet:${candidateOrdinal}`, treeNodeId: `tree:${candidateOrdinal}`, symbolVersionId: `symbol:${candidateOrdinal}`,
      workspaceRevision: 'workspace:pack:v1', sourceRevision, graphRevision: null, semanticRevision: 'semantic:v1',
      featureRevision: 'feature:pack:v1', semanticRelevance: 0.5, lexicalRelevance: null, astAffinity: null,
      graphAuthority: null, personalizedPageRank: null, communityAffinity: null, manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null, crossEncoderCalibratedScore: null, crossEncoderAvailable: false, domainAffinity: null,
      executionUtility: null, memoryUtility: null, laneMask: ['semantic'], degradedIdentity: false,
      evidenceRefs: [`evidence:${candidateOrdinal}`],
    })),
  });
  return materializeCandidateFeatureGpuPack({ columnar: materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'producer:pack:v1' }), rowAlignment: 2, producerRevision: 'producer:pack:v1' });
}

const revisions = { representationRevision: 'representation:v1', modelRevision: 'model:v1', tokenizerRevision: 'tokenizer:v1', ropeRevision: 'rope:v1' };

describe('unified residency feature-pack adapter', () => {
  it('preserves one source revision and emits a typed buffer', () => {
    const result = prepareUnifiedResidencyFeaturePackV1({ pack: makePack(['source:one']), ...revisions });
    expect(result.descriptor.shape).toEqual([2, 12]);
    expect(result.descriptor.sourceRevision).toBe('source:one');
    expect(result.featureBuffer).toHaveLength(24);
    expect(result.writesPerformed).toBe(false);
    return expect(loadUnifiedResidencyFeaturePackV1(result)).resolves.toMatchObject({ state: 'RESIDENT', residencyKey: result.descriptor.residencyKey });
  });

  it('rejects a mixed-source pack instead of collapsing revisions', () => {
    expect(() => prepareUnifiedResidencyFeaturePackV1({ pack: makePack(['source:one', 'source:two']), ...revisions })).toThrow('UNIFIED_RESIDENCY_FEATURE_PACK_MIXED_SOURCE_REVISIONS');
  });

  it('lowers mixed-source packs into ordinal-preserving per-row tiles', () => {
    const results = prepareUnifiedResidencyFeaturePackBatchV1({ pack: makePack(['source:one', 'source:two']), ...revisions });
    expect(results.map((result) => [result.descriptor.candidateOrdinal, result.sourceRevision])).toEqual([[0, 'source:one'], [1, 'source:two']]);
    expect(results.every((result) => result.descriptor.shape.join(',') === '1,12')).toBe(true);
  });
});
