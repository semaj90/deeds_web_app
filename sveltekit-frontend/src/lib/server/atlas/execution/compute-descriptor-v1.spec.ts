import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap, type CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot, type CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import { buildCandidateOrdinalBitsetSelectionV1 } from '../features/candidate-ordinal-bitset-selection-v1.js';
import { CANDIDATE_SCALAR_FEATURES } from '../features/candidate-feature-columnar-v1.js';
import {
  buildComputeDescriptorV1,
  decodeComputeDescriptorV1,
  encodeComputeDescriptorV1,
} from './compute-descriptor-v1.js';
import { TopKExecutionSchema, type TopKExecutionV1 } from './topk-execution-receipt-v1.js';

const revision = (char: string) => `sha256:${char.repeat(64)}`;
const digest = (char: string) => char.repeat(64);

function makeMap(): CandidateOrdinalMapV1 {
  return materializeCandidateOrdinalMap({
    candidates: ['a', 'b'].map((suffix) => ({
      canonicalId: `canonical:${suffix}`,
      packetKey: `packet:${suffix}`,
      sourceRef: `src/${suffix}.ts`,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: revision('a'),
      sourceRevision: revision(suffix),
      graphRevision: null,
      semanticRevision: null,
      degradedIdentity: false,
      evidenceRefs: [`evidence:${suffix}`],
    })),
    candidateSnapshotRevision: revision('b'),
    workspaceRevision: revision('a'),
    producerRevision: 'compute-descriptor-test:v1',
  });
}

function makeSnapshot(ordinalMap: CandidateOrdinalMapV1): CandidateFeatureSnapshotV1 {
  const rows = ordinalMap.candidates.map((candidate) => ({
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    featureRevision: 'features:v1',
    semanticRelevance: 0.2,
    lexicalRelevance: 0.3,
    astAffinity: 0.1,
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
    laneMask: ['lexical'] as ('semantic' | 'lexical' | 'ast' | 'graph' | 'domain')[],
    degradedIdentity: candidate.degradedIdentity,
    evidenceRefs: candidate.evidenceRefs,
  }));
  return materializeCandidateFeatureSnapshot({
    ordinalMap,
    rows,
    featureRevision: 'features:v1',
    producerRevision: 'compute-descriptor-test:v1',
  });
}

function makeArtifactManifest(ordinalMap: CandidateOrdinalMapV1, featureSnapshot: CandidateFeatureSnapshotV1) {
  return {
    schema: 'atlas.tensor-artifact-manifest.v1' as const,
    artifactId: 'fixture:candidate-feature-matrix',
    artifactKind: 'CANDIDATE_FEATURE_MATRIX' as const,
    artifactFormat: 'ARROW_IPC' as const,
    artifactUri: 'atlas-artifact://fixtures/candidate-features.arrow',
    artifactChecksum: `sha256:${digest('9')}`,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    representationId: null,
    representationRevision: null,
    featureSchemaRevision: featureSnapshot.featureRevision,
    rowCount: ordinalMap.rowCount,
    columnCount: CANDIDATE_SCALAR_FEATURES.length,
    shape: [ordinalMap.rowCount, CANDIDATE_SCALAR_FEATURES.length],
    dtype: 'float32' as const,
    byteLength: ordinalMap.rowCount * CANDIDATE_SCALAR_FEATURES.length * 4,
    producerId: 'compute-descriptor-test',
    producerRevision: 'compute-descriptor-test:v1',
    canonicalAuthority: false as const,
  };
}

function makeTopK(ordinalMap: CandidateOrdinalMapV1): TopKExecutionV1 {
  return TopKExecutionSchema.parse({
    schema: 'atlas.topk.execution.v1',
    requestId: 'request:compute-descriptor-test',
    executionId: `topk:${digest('c')}`,
    workspaceRevision: ordinalMap.workspaceRevision,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    sourceRevisionSetChecksum: digest('d'),
    representationRevision: 'semantic_768:test',
    graphRevision: 'graph:test',
    taxonomyRevision: 'taxonomy:test',
    featureSchemaRevision: 'feature-schema:test',
    evidenceRevision: 'evidence:test',
    algorithm: 'cpu_exact',
    backend: 'cpu',
    k: 2,
    headId: 'head:test',
    candidateOrdinals: [0, 1],
    candidateSetDigest: digest('e'),
    ordinalMapDigest: ordinalMap.ordinalMapChecksum,
    columnarChecksum: digest('f'),
    tileDigest: digest('1'),
    scoreVectorDigest: digest('2'),
    selected: [{ canonicalId: 'canonical:a', ordinal: 0, score: 0.9, rank: 1 }],
    outputDigest: digest('3'),
    parityVerified: false,
    status: 'PASS',
    canonicalAuthority: false,
    writesPerformed: false,
    gpuExecuted: false,
  });
}

describe('ComputeDescriptorV1', () => {
  it('binds one packet to the same map, snapshot, selection bitmap, and Top-K result', () => {
    const ordinalMap = makeMap();
    const featureSnapshot = makeSnapshot(ordinalMap);
    const inputArtifactManifest = makeArtifactManifest(ordinalMap, featureSnapshot);
    const selection = buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [0] });
    const descriptor = buildComputeDescriptorV1({
      packetKey: 'packet:a',
      operation: 'BITSET_INTERSECT',
      executorHint: 'CPU',
      ordinalMap,
      featureSnapshot,
      selection,
      inputArtifactManifest,
      topKExecution: makeTopK(ordinalMap),
    });

    expect(descriptor).toMatchObject({
      packetKey: 'packet:a',
      canonicalId: 'canonical:a',
      sourceRef: 'src/a.ts',
      sourceRevision: revision('a'),
      candidateOrdinal: 0,
      ordinalMapDigest: ordinalMap.ordinalMapChecksum,
      selectionBitCount: 2,
      operation: 'BITSET_INTERSECT',
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(descriptor.selectionBitmapDigest).toBe(selection.manifest.byteaSha256);
    expect(descriptor.inputArtifactRef).toBe(inputArtifactManifest.artifactUri);
    expect(descriptor.inputArtifactBinding).toBe('MANIFEST_ONLY');
    expect(JSON.stringify(descriptor)).not.toContain('score');

    const envelope = encodeComputeDescriptorV1(descriptor);
    const decoded = decodeComputeDescriptorV1(envelope, {
      requestId: descriptor.requestId,
      packetKey: descriptor.packetKey,
      canonicalId: descriptor.canonicalId,
      sourceRef: descriptor.sourceRef,
      sourceRevision: descriptor.sourceRevision,
      workspaceRevision: descriptor.workspaceRevision,
      candidateOrdinal: descriptor.candidateOrdinal,
      candidateSnapshotRevision: descriptor.candidateSnapshotRevision,
      featureSnapshotChecksum: descriptor.featureSnapshotChecksum,
      ordinalMapDigest: descriptor.ordinalMapDigest,
      selectionBitmapDigest: descriptor.selectionBitmapDigest,
      inputArtifactDigest: descriptor.inputArtifactDigest,
      inputArtifactManifestChecksum: descriptor.inputArtifactManifestChecksum,
      topKExecutionId: descriptor.topKExecutionId,
      topKOutputDigest: descriptor.topKOutputDigest,
      operation: descriptor.operation,
    });
    expect(decoded).toEqual(descriptor);
    expect(envelope.canonicalAuthority).toBe(false);
  });

  it('rejects damaged MessagePack envelopes and mismatched expected identity', () => {
    const ordinalMap = makeMap();
    const featureSnapshot = makeSnapshot(ordinalMap);
    const descriptor = buildComputeDescriptorV1({
      packetKey: 'packet:a',
      operation: 'BITSET_INTERSECT',
      executorHint: 'CPU',
      ordinalMap,
      featureSnapshot,
      selection: buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [0] }),
      inputArtifactManifest: makeArtifactManifest(ordinalMap, featureSnapshot),
      topKExecution: makeTopK(ordinalMap),
    });
    const envelope = encodeComputeDescriptorV1(descriptor);
    const expected = {
      requestId: descriptor.requestId,
      packetKey: descriptor.packetKey,
      canonicalId: descriptor.canonicalId,
      sourceRef: descriptor.sourceRef,
      sourceRevision: descriptor.sourceRevision,
      workspaceRevision: descriptor.workspaceRevision,
      candidateOrdinal: descriptor.candidateOrdinal,
      candidateSnapshotRevision: descriptor.candidateSnapshotRevision,
      featureSnapshotChecksum: descriptor.featureSnapshotChecksum,
      ordinalMapDigest: descriptor.ordinalMapDigest,
      selectionBitmapDigest: descriptor.selectionBitmapDigest,
      inputArtifactDigest: descriptor.inputArtifactDigest,
      inputArtifactManifestChecksum: descriptor.inputArtifactManifestChecksum,
      topKExecutionId: descriptor.topKExecutionId,
      topKOutputDigest: descriptor.topKOutputDigest,
      operation: descriptor.operation,
    } as const;

    expect(() => decodeComputeDescriptorV1({ ...envelope, byteLength: envelope.byteLength + 1 }, expected))
      .toThrow('COMPUTE_DESCRIPTOR_ENVELOPE_LENGTH_MISMATCH');
    expect(() => decodeComputeDescriptorV1({ ...envelope, canonicalJsonChecksum: `sha256:${digest('0')}` }, expected))
      .toThrow('COMPUTE_DESCRIPTOR_ENVELOPE_CHECKSUM_MISMATCH');
    expect(() => decodeComputeDescriptorV1(envelope, { ...expected, packetKey: 'packet:other' }))
      .toThrow('COMPUTE_DESCRIPTOR_EXPECTATION_MISMATCH:packetKey');
  });

  it('refuses a packet absent from the frozen bitmap or Top-K output', () => {
    const ordinalMap = makeMap();
    const featureSnapshot = makeSnapshot(ordinalMap);
    const inputArtifactManifest = makeArtifactManifest(ordinalMap, featureSnapshot);
    const selection = buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [0] });
    const topKExecution = makeTopK(ordinalMap);

    expect(() => buildComputeDescriptorV1({
      packetKey: 'packet:b', operation: 'EXACT_TOPK', executorHint: 'CPU', ordinalMap, featureSnapshot, inputArtifactManifest, selection, topKExecution,
    })).toThrow('COMPUTE_DESCRIPTOR_PACKET_NOT_SELECTED_BY_BITMAP');
    expect(() => buildComputeDescriptorV1({
      packetKey: 'packet:b',
      operation: 'EXACT_TOPK',
      executorHint: 'CPU',
      ordinalMap,
      featureSnapshot,
      inputArtifactManifest,
      selection: buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [0, 1] }),
      topKExecution,
    })).toThrow('COMPUTE_DESCRIPTOR_PACKET_NOT_SELECTED_BY_TOPK');
  });

  it('rejects corrupted feature snapshot checksums and map revision mismatches', () => {
    const ordinalMap = makeMap();
    const featureSnapshot = makeSnapshot(ordinalMap);
    const inputArtifactManifest = makeArtifactManifest(ordinalMap, featureSnapshot);
    const selection = buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [0] });
    const topKExecution = makeTopK(ordinalMap);

    expect(() => buildComputeDescriptorV1({
      packetKey: 'packet:a',
      operation: 'EXACT_TOPK',
      executorHint: 'NAPI',
      ordinalMap,
      featureSnapshot: { ...featureSnapshot, snapshotChecksum: digest('0') },
      inputArtifactManifest,
      selection,
      topKExecution,
    })).toThrow('COMPUTE_DESCRIPTOR_FEATURE_SNAPSHOT_CHECKSUM_MISMATCH');
    expect(() => buildComputeDescriptorV1({
      packetKey: 'packet:a',
      operation: 'EXACT_TOPK',
      executorHint: 'CPU',
      ordinalMap,
      featureSnapshot,
      inputArtifactManifest,
      selection,
      topKExecution: { ...topKExecution, workspaceRevision: revision('z') },
    })).toThrow('COMPUTE_DESCRIPTOR_TOPK_MAP_MISMATCH');
    expect(() => buildComputeDescriptorV1({
      packetKey: 'packet:a',
      operation: 'EXACT_TOPK',
      executorHint: 'CPU',
      ordinalMap,
      featureSnapshot,
      inputArtifactManifest: { ...inputArtifactManifest, ordinalMapChecksum: digest('0') },
      selection,
      topKExecution,
    })).toThrow('COMPUTE_DESCRIPTOR_INPUT_ARTIFACT_LINEAGE_MISMATCH');
  });
});
