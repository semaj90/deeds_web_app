import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeCandidateOrdinalSelectionV1 } from '../features/candidate-ordinal-selection-v1.js';
import { materializeCandidateFeatureSelectionSnapshotV1 } from '../features/candidate-feature-selection-snapshot-v1.js';
import {
  composeContextualRecommendationsV1,
  type RecommendationHelperCandidateBindingV1,
} from './recommendation-composition-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const semanticRevision = 'semantic_768:embeddinggemma:fixture-v1';
const helperCatalogRevision = 'helper-catalog:fixture-v1';

function prepared() {
  const ordinalMap = materializeCandidateOrdinalMap({
    workspaceRevision,
    candidateSnapshotRevision: 'candidate-snapshot:fixture-v1',
    producerRevision: 'ordinal-map-producer:fixture-v1',
    candidates: [{
      canonicalId: 'canonical:function:validatePacket',
      packetKey: 'packet:validatePacket',
      sourceRef: 'packages/atlas-core/src/packet-reader.ts',
      treeNodeId: 'tree-node:validatePacket',
      symbolVersionId: 'symbol-version:validatePacket',
      workspaceRevision,
      sourceRevision,
      graphRevision: null,
      semanticRevision,
      degradedIdentity: false,
      evidenceRefs: ['evidence:source-span:fixture'],
      representationBindings: [],
    }],
  });
  const selection = materializeCandidateOrdinalSelectionV1({
    requestId: 'request:recommendation-fixture',
    ordinalMap,
    selectedOrdinals: [0],
  });
  const featureSelection = materializeCandidateFeatureSelectionSnapshotV1({
    ordinalMap,
    selection,
    featureRevision: 'features:fixture-v1',
    producerRevision: 'feature-selection-producer:fixture-v1',
    rows: [{
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: 0,
      canonicalId: 'canonical:function:validatePacket',
      packetKey: 'packet:validatePacket',
      sourceRef: 'packages/atlas-core/src/packet-reader.ts',
      treeNodeId: 'tree-node:validatePacket',
      symbolVersionId: 'symbol-version:validatePacket',
      workspaceRevision,
      sourceRevision,
      graphRevision: null,
      semanticRevision,
      featureRevision: 'features:fixture-v1',
      representationBindings: [],
      semanticRelevance: 0.9,
      lexicalRelevance: null,
      astAffinity: 0.8,
      graphAuthority: null,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: null,
      executionUtility: 0.8,
      memoryUtility: null,
      laneMask: ['semantic', 'ast'],
      degradedIdentity: false,
      evidenceRefs: ['evidence:source-span:fixture'],
    }],
  });
  const binding: RecommendationHelperCandidateBindingV1 = {
    schema: 'atlas.recommendation.helper-candidate-binding.v1',
    catalogRevision: helperCatalogRevision,
    helperId: 'helper:validate-packet',
    canonicalId: 'canonical:function:validatePacket',
    packetKey: 'packet:validatePacket',
    sourceRef: 'packages/atlas-core/src/packet-reader.ts',
    sourceRevision,
    workspaceRevision,
    semanticRevision,
    kind: 'helper',
    action: 'inspect_packet_validation',
    rationale: 'The selected source candidate matches the explicit helper binding.',
    requiresApproval: true,
  };
  const artifact = {
    schema: 'parent-atlas.low-rank-helper-artifact.v1' as const,
    artifactRevision: 'low-rank-artifact:fixture-v1',
    rank: 1,
    taskFactors: [{ taskFamily: 'packet-validation', factors: [1] }],
    helperFactors: [{
      helperId: binding.helperId,
      factors: [1],
      successRate: 0.8,
      validationRate: 0.9,
      medianLatencyMs: 10,
      medianContextTokens: 200,
    }],
    trainingReceiptRefs: ['receipt:reviewed-fixture'],
  };
  return { ordinalMap, selection, featureSelection, binding, artifact };
}

describe('recommendation composition v1', () => {
  it('joins only the exact selected candidate and emits an advisory proposal', () => {
    const fixture = prepared();
    const result = composeContextualRecommendationsV1({
      requestId: fixture.selection.requestId,
      queryIntent: 'validate packet source lineage',
      taskFamily: 'packet-validation',
      helperCatalogRevision,
      bindings: [fixture.binding],
      artifact: fixture.artifact,
      ordinalMap: fixture.ordinalMap,
      selection: fixture.selection,
      featureSelection: fixture.featureSelection,
      contextManifestChecksum: 'c'.repeat(64),
    });

    expect(result.status).toBe('ADVISORY');
    expect(result.batch.proposals).toHaveLength(1);
    expect(result.batch.proposals[0]).toMatchObject({
      qualification: 'ADVISORY',
      factorArtifactId: fixture.artifact.artifactRevision,
      candidate: {
        canonicalId: fixture.binding.canonicalId,
        packetKey: fixture.binding.packetKey,
        sourceRevision,
        representationRevision: semanticRevision,
      },
    });
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects a mapping that disagrees with the selected source revision', () => {
    const fixture = prepared();
    const result = composeContextualRecommendationsV1({
      requestId: fixture.selection.requestId,
      queryIntent: 'validate packet source lineage',
      taskFamily: 'packet-validation',
      helperCatalogRevision,
      bindings: [{ ...fixture.binding, sourceRevision: `sha256:${'d'.repeat(64)}` }],
      artifact: fixture.artifact,
      ordinalMap: fixture.ordinalMap,
      selection: fixture.selection,
      featureSelection: fixture.featureSelection,
      contextManifestChecksum: 'c'.repeat(64),
    });

    expect(result.status).toBe('ABSTAINED');
    expect(result.batch.proposals).toHaveLength(0);
    expect(result.rejectedBindings).toEqual([{
      helperId: fixture.binding.helperId,
      reason: 'SOURCE_REVISION_MISMATCH',
    }]);
  });

  it('rejects a tampered feature-selection checksum before ranking', () => {
    const fixture = prepared();
    expect(() => composeContextualRecommendationsV1({
      requestId: fixture.selection.requestId,
      queryIntent: 'validate packet source lineage',
      taskFamily: 'packet-validation',
      helperCatalogRevision,
      bindings: [fixture.binding],
      artifact: fixture.artifact,
      ordinalMap: fixture.ordinalMap,
      selection: fixture.selection,
      featureSelection: { ...fixture.featureSelection, snapshotChecksum: 'f'.repeat(64) },
      contextManifestChecksum: 'c'.repeat(64),
    })).toThrow('FEATURE_SELECTION_SNAPSHOT_CHECKSUM_MISMATCH');
  });
});
