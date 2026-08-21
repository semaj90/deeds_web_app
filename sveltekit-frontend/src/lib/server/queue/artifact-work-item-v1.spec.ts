import { describe, expect, it } from 'vitest';
import {
  actionWorkItemSchema,
  artifactAddressSchema,
  artifactWorkResultSchema,
} from './artifact-work-item-v1.js';

const artifact = {
  schema: 'atlas.artifact-address.v1' as const,
  artifactId: 'feature-snapshot-1',
  artifactHash: '0123456789abcdef0123456789abcdef',
  schemaId: 'atlas.candidate-feature-snapshot.v1',
  checksum: 'abcdef0123456789abcdef0123456789',
  revisionSetHash: '11111111111111112222222222222222',
  revisions: {
    workspace: 'workspace-v1',
    feature: 'feature-v1',
  },
  locator: {
    storage: 'MMAP' as const,
    path: 'artifacts/feature-snapshot-v1/semantic768.fp16',
    byteOffset: 0,
    byteLength: 4096,
    dtype: 'f16' as const,
    shape: [256, 8],
  },
};

describe('ArtifactAddressV1', () => {
  it('accepts a checksummed mmap reference', () => {
    expect(artifactAddressSchema.parse(artifact).locator.storage).toBe('MMAP');
  });

  it('rejects short checksums', () => {
    expect(() => artifactAddressSchema.parse({ ...artifact, checksum: 'bad' })).toThrow();
  });
});

describe('ActionWorkItemV1', () => {
  it('carries references and budgets instead of dense payloads', () => {
    const parsed = actionWorkItemSchema.parse({
      schema: 'atlas.action-work-item.v1',
      actionKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      commandType: 'retrieval.materialize',
      operation: 'materialize-candidate-feature-snapshot',
      inputArtifactRefs: [artifact],
      requiredRevisionSetHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      candidateSelection: {
        kind: 'ordinal-range',
        startInclusive: 0,
        endExclusive: 256,
      },
      budget: {
        timeoutMs: 30_000,
        maxCpuBytes: 512 * 1024 * 1024,
        maxGpuBytes: 1024 * 1024 * 1024,
        maxCandidateCount: 256,
      },
      executorClass: 'GPU',
      priority: 'normal',
      parametersHash: 'cccccccccccccccccccccccccccccccc',
      expectedOutputSchema: 'atlas.candidate-feature-snapshot.v1',
      producerRevision: 'candidate-fabric-v1',
    });

    expect(parsed.inputArtifactRefs).toHaveLength(1);
    expect(parsed.candidateSelection?.kind).toBe('ordinal-range');
    expect(parsed.budget.maxCandidateCount).toBe(256);
  });

  it('rejects inverted ordinal ranges', () => {
    expect(() => actionWorkItemSchema.parse({
      schema: 'atlas.action-work-item.v1',
      actionKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      commandType: 'retrieval.materialize',
      operation: 'bad-range',
      inputArtifactRefs: [],
      requiredRevisionSetHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      candidateSelection: {
        kind: 'ordinal-range',
        startInclusive: 10,
        endExclusive: 5,
      },
      budget: { timeoutMs: 1000 },
      executorClass: 'CPU',
      priority: 'normal',
      parametersHash: 'cccccccccccccccccccccccccccccccc',
      expectedOutputSchema: 'x',
      producerRevision: 'v1',
    })).toThrow();
  });
});

describe('ArtifactWorkResultV1', () => {
  it('binds a reusable immutable output to ActionKey, revision set and fencing token', () => {
    const parsed = artifactWorkResultSchema.parse({
      schema: 'atlas.action-work-result.v1',
      actionKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      revisionSetHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      artifact,
      producerRevision: 'candidate-fabric-v1',
      fencingToken: '7',
      receiptRef: 'receipt:artifact-work:1',
    });

    expect(parsed.artifact.artifactId).toBe('feature-snapshot-1');
    expect(parsed.fencingToken).toBe('7');
  });

  it('rejects a non-numeric fencing token', () => {
    expect(() => artifactWorkResultSchema.parse({
      schema: 'atlas.action-work-result.v1',
      actionKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      revisionSetHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      artifact,
      producerRevision: 'candidate-fabric-v1',
      fencingToken: 'old-worker',
    })).toThrow();
  });
});
