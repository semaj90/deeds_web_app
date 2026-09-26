import { describe, expect, it } from 'vitest';
import {
  bridgeUnifiedContextPipelineToAceIdentityV1,
  buildUnifiedContextPipelineCacheKeyV1,
  buildUnifiedContextPipelineDescriptorV1,
  domainPredictionToUnifiedContextEvidenceV1,
} from './unified-context-pipeline-v1.js';

const sha = (n: string) => n.padStart(64, '0').slice(-64);

function input(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'req:unified-1',
    workspaceId: 'repo:root',
    workspaceRevision: 'sha256:' + sha('1'),
    executionId: '74d50c86-8194-45ea-8c3d-61aab737ef83',
    sourceCohortChecksum: sha('2'),
    graphRevision: 'graph:current-1',
    candidateOrdinalChecksum: sha('3'),
    representationRevision: 'semantic_768:r1',
    featureRevision: 'features:v1',
    classifierRevision: 'domain:nb-lr:v1',
    checkpointChecksum: sha('4'),
    queryHash: sha('5'),
    queryRepresentation: {
      representationId: 'semantic_768' as const,
      modelRevision: 'embeddinggemma:r1',
      dimension: 768 as const,
      normalizationPolicy: 'l2:v1',
      distanceMetric: 'cosine' as const,
      queryChecksum: sha('6'),
    },
    classifierEvidence: {
      predictedDomain: 'retrieval',
      confidence: 0.91,
      sourceEvidenceChecksum: sha('7'),
      canonicalAuthority: false as const,
    },
    chunkStream: {
      transport: 'CONTROL_JSON' as const,
      chunkBytes: 64 * 1024,
      maxChunks: 128,
      sequenceChecksum: sha('8'),
      bounded: true as const,
    },
    graphTransport: {
      format: 'CSR' as const,
      ordinalMapChecksum: sha('3'),
      numericPayload: 'TYPED_BINARY' as const,
      jsonInHotLoop: false as const,
    },
    cache: {
      cacheKind: 'ACE_CONTEXT' as const,
      cacheKey: 'atlas:bitfrost:existing-owner',
      identityChecksum: sha('9'),
      admission: 'ADMITTED' as const,
    },
    stages: [{
      name: 'DOMAIN_CLASSIFICATION' as const,
      executor: 'PYTHON' as const,
      producerRevision: 'domain:adapter:v1',
      inputChecksum: sha('a'),
      outputChecksum: sha('b'),
      status: 'PROVEN' as const,
      readOnly: true as const,
      canonicalAuthority: false as const,
    }],
    ...overrides,
  };
}

describe('UnifiedContextPipelineDescriptorV1', () => {
  it('binds classifier, stream, graph, representation, and cache identity deterministically', () => {
    const first = buildUnifiedContextPipelineDescriptorV1(input());
    const second = buildUnifiedContextPipelineDescriptorV1(input());
    expect(first.descriptorChecksum).toBe(second.descriptorChecksum);
    expect(first.status).toBe('READY');
    expect(first.canonicalAuthority).toBe(false);
    expect(first.writesPerformed).toBe(false);
    expect(buildUnifiedContextPipelineCacheKeyV1(first)).toBe(buildUnifiedContextPipelineCacheKeyV1(second));
    expect(bridgeUnifiedContextPipelineToAceIdentityV1(first).representationId).toBe('semantic_768');
  });

  it('blocks promotion identity when current lineage is incomplete', () => {
    const descriptor = buildUnifiedContextPipelineDescriptorV1(input({ sourceCohortChecksum: null }));
    expect(descriptor.status).toBe('BLOCKED');
    expect(descriptor.cache.admission).toBe('BLOCKED');
  });

  it('keeps JSON control transport separate from typed numeric graph transport', () => {
    const descriptor = buildUnifiedContextPipelineDescriptorV1(input());
    expect(descriptor.chunkStream.transport).toBe('CONTROL_JSON');
    expect(descriptor.graphTransport.numericPayload).toBe('TYPED_BINARY');
    expect(descriptor.graphTransport.jsonInHotLoop).toBe(false);
  });

  it('rejects hidden-state persistence fields', () => {
    expect(() => buildUnifiedContextPipelineDescriptorV1(input({ kv_cache: 'forbidden' }))).toThrow();
  });

  it('refuses to bridge an incomplete descriptor into ACE/BitFrost identity', () => {
    const descriptor = buildUnifiedContextPipelineDescriptorV1(input({ sourceCohortChecksum: null }));
    expect(() => bridgeUnifiedContextPipelineToAceIdentityV1(descriptor)).toThrow('UNIFIED_CONTEXT_CACHE_IDENTITY_INCOMPLETE');
  });

  it('maps DomainPrediction evidence without promoting packet identity', () => {
    const evidence = domainPredictionToUnifiedContextEvidenceV1({
      predictedDomain: 'retrieval',
      calibratedConfidence: 0.88,
      classifierVersion: 'nb-lr:v1',
      modelSha256: sha('d'),
      featureSchemaVersion: 'features:v1',
      sourceSnapshotSha256: sha('e'),
    });
    expect(evidence.classifierRevision).toBe('nb-lr:v1');
    expect(evidence.checkpointChecksum).toBe(sha('d'));
    expect(evidence.classifierEvidence.canonicalAuthority).toBe(false);
  });
});
