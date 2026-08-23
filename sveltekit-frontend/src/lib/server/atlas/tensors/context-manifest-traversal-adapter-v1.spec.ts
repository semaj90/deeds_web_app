import { describe, expect, it } from 'vitest';
import { compileTraversalInstructionFromContextManifestV1 } from './context-manifest-traversal-adapter-v1.js';

const checksum = 'b'.repeat(64);
const manifest = {
  schema: 'atlas.context-manifest.v1' as const,
  requestId: 'request:1',
  snapshotId: 'snapshot:1',
  graphRevision: 'snapshot:1',
  query: 'find callers',
  candidateBucket: 4 as const,
  candidateCount: 2,
  tokenBudget: 512,
  selectedNodeKeys: ['node:1', 'node:2'],
  evidenceRefs: ['src/a.ts#node:1', 'src/b.ts#node:2'],
  producerRevision: 'manifest:1',
};

describe('ContextManifestTraversalAdapterV1', () => {
  it('binds manifest membership and graph revision to the instruction', () => {
    const instruction = compileTraversalInstructionFromContextManifestV1({
      manifest,
      snapshotRevision: 'snapshot:1',
      ordinalMapChecksum: checksum,
      actionKind: 'EXPAND_GRAPH',
      candidateOrdinals: [0, 1],
      primaryOrdinal: 0,
      headMask: 4,
      graphDepth: 2,
      confidence: 0.8,
      utility: 0.7,
      risk: 0.1,
      producerRevision: 'instruction:1',
    });
    expect(instruction.candidateCount).toBe(2);
    expect(instruction.snapshotRevision).toBe('snapshot:1');
  });

  it('rejects a candidate set that does not match the manifest', () => {
    expect(() => compileTraversalInstructionFromContextManifestV1({
      manifest,
      snapshotRevision: 'snapshot:1',
      ordinalMapChecksum: checksum,
      actionKind: 'RETRIEVE',
      candidateOrdinals: [0],
      primaryOrdinal: 0,
      confidence: 0.8,
      utility: 0.7,
      risk: 0.1,
      producerRevision: 'instruction:1',
    })).toThrow('TRAVERSAL_CONTEXT_CANDIDATE_COUNT_MISMATCH');
  });
});
