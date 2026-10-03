import { describe, expect, it } from 'vitest';
import { buildRetrievalRouterTensorV2, RETRIEVAL_ROUTER_TENSOR_REVISION_V2 } from './retrieval-router-tensor-manifest-v2.js';
import { checksumRetrievalRouterTensorV2, projectCompactQueryRouterTensorV1 } from './project-compact-query-router-tensor-v1.js';

function sourceTensor(overrides: Partial<Parameters<typeof buildRetrievalRouterTensorV2>[0]> = {}) {
  return buildRetrievalRouterTensorV2({
    classificationMrl128: Array.from({ length: 128 }, (_, index) => index / 100),
    ontologyMask32: Array.from({ length: 32 }, (_, index) => index + 200),
    queryFeatures: Array.from({ length: 26 }, (_, index) => index + 300),
    operationFlags16: Array.from({ length: 16 }, (_, index) => index + 400),
    runtimeResource16: Array.from({ length: 16 }, (_, index) => index + 500),
    graphToolStructure16: Array.from({ length: 16 }, (_, index) => index + 600),
    ...overrides,
  });
}

function project(tensor: Float32Array) {
  return projectCompactQueryRouterTensorV1({
    sourceTensorRevision: RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
    sourceTensor: tensor,
    sourceTensorChecksum: checksumRetrievalRouterTensorV2(tensor),
  });
}

describe('projectCompactQueryRouterTensorV1', () => {
  it('projects the manifest-owned sections to exactly 154 values', () => {
    const source = sourceTensor();
    const projected = project(source);
    expect(source).toHaveLength(234);
    expect(projected.tensor).toHaveLength(154);
    expect(Array.from(projected.tensor.slice(0, 128))).toEqual(Array.from(source.slice(0, 128)));
    expect(Array.from(projected.tensor.slice(128))).toEqual(Array.from(source.slice(160, 186)));
    expect(projected.sections).toEqual({
      classificationMrl128: { sourceOffset: 0, width: 128 },
      deterministicQueryFeatures26: { sourceOffset: 160, width: 26 },
    });
  });

  it('keeps the compact projection stable when excluded V2 sections change', () => {
    const first = project(sourceTensor());
    const second = project(sourceTensor({
      ontologyMask32: Array.from({ length: 32 }, (_, index) => index + 900),
      operationFlags16: Array.from({ length: 16 }, (_, index) => index + 1000),
      runtimeResource16: Array.from({ length: 16 }, (_, index) => index + 1100),
      graphToolStructure16: Array.from({ length: 16 }, (_, index) => index + 1200),
    }));
    expect(second.tensorChecksum).toBe(first.tensorChecksum);
  });

  it('changes when either owned section changes', () => {
    const first = project(sourceTensor());
    const changedClassification = sourceTensor({ classificationMrl128: Array.from({ length: 128 }, () => 0.5) });
    const changedFeatures = sourceTensor({ queryFeatures: Array.from({ length: 26 }, () => 0.75) });
    expect(project(changedClassification).tensorChecksum).not.toBe(first.tensorChecksum);
    expect(project(changedFeatures).tensorChecksum).not.toBe(first.tensorChecksum);
  });

  it.each([
    ['revision', { sourceTensorRevision: 'atlas.retrieval-router-tensor.v1' }],
    ['width', { sourceTensor: Array.from({ length: 233 }, () => 0) }],
    ['nonfinite', { sourceTensor: (() => { const value = Array.from({ length: 234 }, () => 0); value[10] = Number.NaN; return value; })() }],
    ['checksum', { sourceTensorChecksum: `sha256:${'0'.repeat(64)}` }],
  ])('fails closed for invalid %s input', (_name, invalid) => {
    const source = sourceTensor();
    expect(() => projectCompactQueryRouterTensorV1({
      sourceTensorRevision: invalid.sourceTensorRevision ?? RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
      sourceTensor: invalid.sourceTensor ?? source,
      sourceTensorChecksum: invalid.sourceTensorChecksum ?? checksumRetrievalRouterTensorV2(source),
    })).toThrow();
  });
});
