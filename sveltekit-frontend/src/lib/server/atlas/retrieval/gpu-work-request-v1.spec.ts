import { describe, expect, it } from 'vitest';
import { GpuWorkRequestV1Schema, buildGpuWorkRequest } from './gpu-work-request-v1.js';

describe('GPU work request v1', () => {
  it('carries revisioned artifact references and ordinals, not embedding payloads', () => {
    const request = GpuWorkRequestV1Schema.parse({
      schema: 'atlas.gpu-work-request.v1',
      requestId: 'req:1',
      operation: 'MATERIALIZE_FEATURES',
      snapshotRevision: 'workspace:W1',
      representationId: 'semantic_768',
      representationRevision: 'embeddinggemma-native-768-v1',
      datasetChecksumSha256: 'b'.repeat(64),
      artifactRef: 'cas://semantic/W1',
      ordinals: [83, 991],
      topK: 16,
      headMask: 7,
      graphDepth: 1,
      canonicalWrites: false,
    });
    expect(request.transport).toBe('unary_grpc');
    expect(request).not.toHaveProperty('vectors');
    expect(request).not.toHaveProperty('devicePointer');
  });

  it('composes a request only when snapshot and OKF revisions agree', () => {
    const batch = {
      schema: 'atlas.gpu-candidate-batch-descriptor.v1' as const,
      batchRevision: 'batch:1',
      snapshotRevision: 'source:S1',
      representation: {
        snapshotRevision: 'source:S1',
        representationId: 'semantic_768' as const,
        representationRevision: 'embeddinggemma-native-768-v1',
        dimension: 768 as const,
        metric: 'cosine' as const,
        normalization: 'l2' as const,
        datasetChecksumSha256: 'c'.repeat(64),
      },
      ordinals: [83],
      logicalRows: 1,
      physicalRows: 1,
      tileRows: 1,
      validMask: [1 as const],
      precision: 'fp16' as const,
      device: 'gpu' as const,
      heads: ['semantic' as const],
      sourceArtifactRef: 'cas://semantic/S1',
      canonicalWrites: false as const,
    };
    const request = buildGpuWorkRequest({
      requestId: 'req:2',
      operation: 'MATERIALIZE_FEATURES',
      batch,
      headMapping: {
        schema: 'atlas.okf-head-mapping.v1',
        subjectRef: 'packet:83',
        domainId: 'error-repair',
        taxonomyRevision: 'okf:1',
        sourceRevision: 'source:S1',
        headMask: 7,
        heads: ['semantic', 'structural', 'graph'],
        classificationConfidence: 0.9,
        evidenceRefs: ['source:1'],
        policyRevision: 'policy:1',
        canonicalWrites: false,
      },
      topK: 8,
      graphDepth: 1,
    });
    expect(request.snapshotRevision).toBe('source:S1');
    expect(request.headMask).toBe(7);
    expect(request.ordinals).toEqual([83]);

    expect(() => buildGpuWorkRequest({
      requestId: 'req:3',
      operation: 'MATERIALIZE_FEATURES',
      batch,
      headMapping: {
        schema: 'atlas.okf-head-mapping.v1',
        subjectRef: 'packet:83',
        domainId: 'error-repair',
        taxonomyRevision: 'okf:1',
        sourceRevision: 'source:S2',
        headMask: 7,
        heads: ['semantic', 'structural', 'graph'],
        classificationConfidence: 0.9,
        evidenceRefs: ['source:1'],
        policyRevision: 'policy:1',
        canonicalWrites: false,
      },
      topK: 8,
      graphDepth: 1,
    })).toThrow('GPU_WORK_REVISION_MISMATCH');
  });
});
