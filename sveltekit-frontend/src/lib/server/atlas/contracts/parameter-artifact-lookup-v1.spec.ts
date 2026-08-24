import { describe, expect, it } from 'vitest';
import {
  buildParameterArtifactLookupKey,
  matchesParameterArtifactLookupV1,
  parseParameterArtifactLookupV1,
} from './parameter-artifact-lookup-v1.js';

describe('parameter artifact lookup v1', () => {
  it('builds a revision-aware lookup key without storing tensors', () => {
    expect(buildParameterArtifactLookupKey({
      kind: 'MODEL_ADAPTER',
      producerRevision: 'qlora-gate-v1',
      modelRevision: 'gemma4-r1',
      adapterRevision: 'adapter-r2',
      representationRevision: null,
    })).toBe('atlas:param:v1:MODEL_ADAPTER:qlora-gate-v1:gemma4-r1:adapter-r2:none');
  });

  it('accepts a proven embedding representation receipt', () => {
    const receipt = parseParameterArtifactLookupV1({
      schema: 'atlas.parameter-artifact-lookup.v1',
      lookupKey: 'atlas:param:v1:REPRESENTATION:embeddinggemma-v1:none:semantic_768',
      kind: 'REPRESENTATION',
      modelRevision: 'embeddinggemma-full768-v1',
      adapterRevision: null,
      tokenizerRevision: 'tokenizer-v1',
      representationRevision: 'semantic_768',
      producerRevision: 'embeddinggemma-executor-v1',
      artifactRef: 'qdrant:codebase_chunks_768',
      artifactChecksum: 'a'.repeat(64),
      dimensions: 768,
      metric: 'COSINE',
      normalization: 'L2_VECTOR',
      parameters: { role: 'DOCUMENT' },
      dependencyRevisions: ['workspace:0'],
      canonicalAuthority: true,
      status: 'PROVEN',
    });
    expect(receipt.dimensions).toBe(768);
    expect(receipt.parameters).toEqual({ role: 'DOCUMENT' });
    expect(matchesParameterArtifactLookupV1(receipt, {
      kind: 'REPRESENTATION',
      modelRevision: 'embeddinggemma-full768-v1',
      representationRevision: 'semantic_768',
      dimensions: 768,
      metric: 'COSINE',
      normalization: 'L2_VECTOR',
    })).toBe(true);
    expect(matchesParameterArtifactLookupV1(receipt, {
      kind: 'REPRESENTATION',
      representationRevision: 'semantic_mrl_256',
      dimensions: 256,
    })).toBe(false);
  });

  it('rejects a non-hex artifact checksum', () => {
    expect(() => parseParameterArtifactLookupV1({
      schema: 'atlas.parameter-artifact-lookup.v1',
      lookupKey: 'bad',
      kind: 'MODEL_ADAPTER',
      modelRevision: 'm1',
      adapterRevision: 'a1',
      tokenizerRevision: null,
      representationRevision: null,
      producerRevision: 'p1',
      artifactRef: 'file:adapter.safetensors',
      artifactChecksum: 'not-a-sha256',
      canonicalAuthority: false,
      status: 'CANDIDATE',
    })).toThrow();
  });
});
