import { describe, expect, it } from 'vitest';
import {
  materializeGraphifyStructuralBatchV1,
  materializeGraphifyStructuralDeltaV1,
  type GraphifyStructuralBatchInputV1,
} from './graphify-structural-batch-v1.js';

function result(status: 'PROVEN' | 'RECOVERED_WITH_ERRORS' | 'FAILED') {
  return {
    sourceRef: 'x.ts',
    sourceRevision: 'a'.repeat(40),
    provider: 'treesitter-chunker-8095' as const,
    status,
    evidence: status === 'FAILED' ? null : ({
      diagnostics: status === 'RECOVERED_WITH_ERRORS' ? ['ERROR'] : [],
      syntax: status === 'RECOVERED_WITH_ERRORS' ? [{ node_type: 'ERROR' }] : [],
    } as never),
    normalized: null,
    provenanceReadiness: {
      status: status === 'PROVEN' ? 'NATIVE_READY' as const : 'NO_EVIDENCE' as const,
      nativeNodeIds: 0,
      nativeFileIds: 0,
      nativeSymbolIds: 0,
      upstreamChunkIds: 0,
      symbolCount: 0,
      canonicalPromotionAllowed: status === 'PROVEN',
      reason: 'fixture',
    },
    diagnostics: status === 'FAILED' ? ['provider failure'] : [],
    persistence: 'NOT_ATTEMPTED' as const,
    fallback: 'NONE' as const,
  };
}

const files: GraphifyStructuralBatchInputV1[] = [
  { sourceRef: 'valid-a.ts', sourceRevision: '1'.repeat(40), language: 'typescript', source: 'export const a = 1;', contentHash: 'a' },
  { sourceRef: 'malformed.ts', sourceRevision: '2'.repeat(40), language: 'typescript', source: 'export const =', contentHash: 'b' },
  { sourceRef: 'failed.ts', sourceRevision: '3'.repeat(40), language: 'typescript', source: 'x', contentHash: 'c' },
  { sourceRef: 'valid-b.ts', sourceRevision: '4'.repeat(40), language: 'typescript', source: 'export const b = 2;', contentHash: 'd' },
];

describe('GraphifyStructuralBatchV1', () => {
  it('isolates a failed file and continues the batch', async () => {
    const materializer = {
      async materialize(input: { sourceRef: string }) {
        if (input.sourceRef === 'malformed.ts') return result('RECOVERED_WITH_ERRORS');
        if (input.sourceRef === 'failed.ts') throw new Error('fixture provider failure');
        return result('PROVEN');
      },
    };
    const receipt = await materializeGraphifyStructuralBatchV1({
      workspaceRevision: 'workspace-1',
      files,
      materializer: materializer as never,
    });
    expect(receipt.files.map((row) => row.status)).toEqual([
      'PROVEN', 'RECOVERED_WITH_ERRORS', 'FAILED', 'PROVEN',
    ]);
    expect(receipt.attemptedFileCount).toBe(4);
    expect(receipt.isolatedFailurePass).toBe(true);
    expect(receipt.persistenceAttempted).toBe(false);
    expect(receipt.canonicalWritesAllowed).toBe(false);
  });
});

describe('GraphifyStructuralDeltaV1', () => {
  it('skips unchanged, reparses changed/new, and emits observation-only tombstones', async () => {
    const calls: string[] = [];
    const materializer = {
      async materialize(input: { sourceRef: string }) {
        calls.push(input.sourceRef);
        return result('PROVEN');
      },
    };
    const receipt = await materializeGraphifyStructuralDeltaV1({
      previousSnapshotRevision: 'ws-old',
      currentSnapshotRevision: 'ws-new',
      previous: [
        { sourceRef: 'same.ts', sourceRevision: 'a'.repeat(40), contentHash: 'same' },
        { sourceRef: 'changed.ts', sourceRevision: 'a'.repeat(40), contentHash: 'old' },
        { sourceRef: 'deleted.ts', sourceRevision: 'a'.repeat(40), contentHash: 'gone' },
      ],
      current: [
        { sourceRef: 'same.ts', sourceRevision: 'a'.repeat(40), language: 'typescript', source: 'same', contentHash: 'same' },
        { sourceRef: 'changed.ts', sourceRevision: 'b'.repeat(40), language: 'typescript', source: 'changed', contentHash: 'new' },
        { sourceRef: 'added.ts', sourceRevision: 'b'.repeat(40), language: 'typescript', source: 'added', contentHash: 'added' },
      ],
      materializer: materializer as never,
    });
    expect(calls.sort()).toEqual(['added.ts', 'changed.ts']);
    expect(receipt.unchangedCount).toBe(1);
    expect(receipt.changedCount).toBe(1);
    expect(receipt.addedCount).toBe(1);
    expect(receipt.deletedCount).toBe(1);
    expect(receipt.tombstoneCount).toBe(1);
    const tombstone = receipt.files.find((row) => row.sourceRef === 'deleted.ts')?.tombstone;
    expect(tombstone?.observation).toBe('SOURCE_ABSENT');
    expect(tombstone?.mutationAuthorized).toBe(false);
    expect(tombstone?.canonicalDeletionAllowed).toBe(false);
    expect(receipt.canonicalDeletionPerformed).toBe(false);
  });
});
