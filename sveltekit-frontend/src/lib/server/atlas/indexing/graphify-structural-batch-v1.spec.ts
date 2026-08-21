import { describe, expect, it } from 'vitest';

import type { StructuralMaterializationResult } from './graphify-structural-materializer.js';
import { runGraphifyStructuralBatchV1 } from './graphify-structural-batch-v1.js';

function result(
  sourceRef: string,
  status: StructuralMaterializationResult['status'] = 'PROVEN',
  diagnostics: string[] = [],
): StructuralMaterializationResult {
  return {
    sourceRef,
    sourceRevision: null,
    sourceVersionAnchor: `content:${sourceRef}`,
    sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
    parserSourceRevisionToken: `anchor:content:${sourceRef}`,
    provider: 'treesitter-chunker-8095',
    status,
    evidence: null,
    normalized: null,
    provenanceReadiness: {
      status: status === 'PROVEN' ? 'NATIVE_READY' : 'NATIVE_RECOVERED',
      nativeNodeIds: status === 'PROVEN' ? 1 : 0,
      nativeFileIds: status === 'PROVEN' ? 1 : 0,
      nativeSymbolIds: status === 'PROVEN' ? 1 : 0,
      upstreamChunkIds: status === 'PROVEN' ? 1 : 0,
      symbolCount: 1,
      sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
      sourceRevisionAuthorityReady: false,
      canonicalPromotionAllowed: false,
      reason: status === 'PROVEN' ? 'fixture native but revision authority unproven' : 'fixture recovered',
    },
    diagnostics: [...diagnostics, 'SOURCE_REVISION_AUTHORITY_UNPROVEN'],
    persistence: 'NOT_ATTEMPTED',
    fallback: 'NONE',
  };
}

describe('runGraphifyStructuralBatchV1', () => {
  it('isolates one failed parse without aborting neighboring files', async () => {
    const calls: string[] = [];
    const receipt = await runGraphifyStructuralBatchV1(
      {
        workspaceRevision: 'workspace:test',
        producerRevision: 'test:gph15',
        inputMode: 'FULL_SCAN',
        entries: [
          { sourceRef: 'src/valid-a.ts', action: 'UPSERT', source: 'export const a = 1;' },
          { sourceRef: 'src/broken.ts', action: 'UPSERT', source: 'export function broken( {' },
          { sourceRef: 'src/valid-b.ts', action: 'UPSERT', source: 'export const b = 2;' },
        ],
      },
      {
        async materialize(input) {
          calls.push(input.sourceRef);
          if (input.sourceRef === 'src/broken.ts') throw new Error('fixture parser failure');
          return result(input.sourceRef);
        },
      },
    );

    expect(calls).toEqual(['src/valid-a.ts', 'src/broken.ts', 'src/valid-b.ts']);
    expect(receipt.failedFiles).toBe(1);
    expect(receipt.provenFiles).toBe(2);
    expect(receipt.isolatedFailurePass).toBe(true);
    expect(receipt.revisionAuthorityPass).toBe(false);
    expect(receipt.files.map((item) => [item.sourceRef, item.status])).toEqual([
      ['src/valid-a.ts', 'PROVEN'],
      ['src/broken.ts', 'FAILED'],
      ['src/valid-b.ts', 'PROVEN'],
    ]);
    expect(receipt.files[0]?.canonicalPromotionAllowed).toBe(false);
    expect(receipt.files[0]?.sourceRevision).toBeNull();
    expect(receipt.files[0]?.sourceRevisionAuthority).toBe('CONTENT_ANCHOR_ONLY');
    expect(receipt.files[1]?.diagnostics).toContain('fixture parser failure');
    expect(receipt.outputChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('proves skip changed extraction and explicit deletion without fabricating source revision authority', async () => {
    const changedSource = 'export const changed = 2;';
    const crypto = await import('node:crypto');
    const changedHash = crypto.createHash('sha256').update(changedSource).digest('hex');
    const unchangedSource = 'export const unchanged = 1;';
    const unchangedHash = crypto.createHash('sha256').update(unchangedSource).digest('hex');
    const calls: string[] = [];

    const receipt = await runGraphifyStructuralBatchV1(
      {
        workspaceRevision: 'workspace:test',
        producerRevision: 'test:gph16',
        inputMode: 'DELTA_MANIFEST',
        entries: [
          {
            sourceRef: './src/unchanged.ts',
            action: 'UPSERT',
            source: unchangedSource,
            priorContentHash: unchangedHash,
          },
          {
            sourceRef: 'src/changed.ts',
            action: 'UPSERT',
            source: changedSource,
            priorContentHash: 'old-hash',
            currentContentHash: changedHash,
          },
          {
            sourceRef: 'src/deleted.ts',
            action: 'DELETE',
            priorContentHash: 'deleted-hash',
          },
        ],
      },
      {
        async materialize(input) {
          calls.push(input.sourceRef);
          expect(input.sourceRevision).toBeNull();
          expect(input.sourceRevisionAuthority).toBe('CONTENT_ANCHOR_ONLY');
          expect(input.sourceVersionAnchor).toContain('content:');
          return result(input.sourceRef);
        },
      },
    );

    expect(calls).toEqual(['src/changed.ts']);
    expect(receipt.skippedUnchangedFiles).toBe(1);
    expect(receipt.provenFiles).toBe(1);
    expect(receipt.tombstoneCount).toBe(1);
    expect(receipt.incrementalDeltaPass).toBe(true);
    expect(receipt.revisionAuthorityPass).toBe(false);
    expect(receipt.tombstones[0]).toMatchObject({
      sourceRef: 'src/deleted.ts',
      reason: 'SOURCE_DELETED',
      priorContentHash: 'deleted-hash',
      sourceRevision: null,
      sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
    });
    expect(receipt.files.map((item) => item.status)).toEqual([
      'SKIPPED_UNCHANGED',
      'PROVEN',
      'TOMBSTONED',
    ]);
  });

  it('rejects duplicate source refs before double-processing a delta', async () => {
    await expect(
      runGraphifyStructuralBatchV1(
        {
          workspaceRevision: 'workspace:test',
          producerRevision: 'test:gph16',
          inputMode: 'DELTA_MANIFEST',
          entries: [
            { sourceRef: 'src/a.ts', action: 'DELETE' },
            { sourceRef: './src/a.ts', action: 'DELETE' },
          ],
        },
        { materialize: async (input) => result(input.sourceRef) },
      ),
    ).rejects.toThrow('DUPLICATE_DELTA_SOURCE_REF:src/a.ts');
  });
});
