import { describe, expect, it } from 'vitest';

import {
  GraphifyStructuralMaterializer,
  type AstProvider,
  type AstProviderResult,
} from './graphify-structural-materializer.js';
import { runGraphifyStructuralBatchV1 } from './graphify-structural-batch-v1.js';

function evidence(sourceRef: string, sourceRevision: string, name: string) {
  return {
    schema: 'atlas.ast.evidence.v1' as const,
    engine: 'treesitter-chunker',
    engine_version: 'test',
    language: 'typescript',
    file_path: sourceRef,
    source_revision: sourceRevision,
    chunks: [{
      upstream_chunk_id: `chunk:${name}`,
      upstream_node_id: `node:${name}`,
      upstream_file_id: `file:${sourceRef}`,
      upstream_symbol_id: `symbol:${name}`,
      node_type: 'function_declaration',
      kind: 'function',
      name,
      parent_route: ['module', name],
      parent_context: 'module',
      start_byte: 0,
      end_byte: 32,
      start_line: 1,
      start_column: 0,
      end_line: 1,
      end_column: 32,
      calls: [],
      imports: [],
      exports: [name],
    }],
    edges: [],
    diagnostics: [],
    syntax_status: 'CLEAN' as const,
  };
}

function providerWithCalls(
  calls: string[],
  outcome: (sourceRef: string, sourceRevision: string) => AstProviderResult,
): AstProvider {
  return {
    async materialize(input) {
      calls.push(input.sourceRef);
      return outcome(input.sourceRef, input.sourceRevision);
    },
  };
}

describe('runGraphifyStructuralBatchV1', () => {
  it('isolates one failed parser input without discarding neighboring files', async () => {
    const calls: string[] = [];
    const provider = providerWithCalls(calls, (sourceRef, sourceRevision) => {
      if (sourceRef === 'src/broken.ts') {
        return {
          provider: 'treesitter-chunker-8095',
          status: 'FAILED',
          diagnostics: ['synthetic parser failure'],
          errorTag: 'ChunkingError',
        };
      }
      const name = sourceRef.includes('valid-a') ? 'validA' : 'validB';
      return {
        provider: 'treesitter-chunker-8095',
        status: 'PROVEN',
        diagnostics: [],
        evidence: evidence(sourceRef, sourceRevision, name),
      };
    });

    const receipt = await runGraphifyStructuralBatchV1({
      workspaceRevision: 'workspace-r1',
      producerRevision: 'test-batch-v1',
      inputs: [
        { schema: 'atlas.graphify-structural-delta-input.v1', action: 'UPSERT', sourceRef: 'src/valid-a.ts', sourceRevision: 'r-a', language: 'typescript', source: 'export function validA(){ return 1; }' },
        { schema: 'atlas.graphify-structural-delta-input.v1', action: 'UPSERT', sourceRef: 'src/broken.ts', sourceRevision: 'r-broken', language: 'typescript', source: 'export function {' },
        { schema: 'atlas.graphify-structural-delta-input.v1', action: 'UPSERT', sourceRef: 'src/valid-b.ts', sourceRevision: 'r-b', language: 'typescript', source: 'export function validB(){ return 2; }' },
      ],
    }, new GraphifyStructuralMaterializer(provider));

    expect(receipt.files.map((file) => file.status)).toEqual(['PROVEN', 'FAILED', 'PROVEN']);
    expect(receipt.isolatedFailurePass).toBe(true);
    expect(receipt.provenFiles).toBe(2);
    expect(receipt.failedFiles).toBe(1);
    expect(calls).toEqual(['src/valid-a.ts', 'src/broken.ts', 'src/valid-b.ts']);
  });

  it('skips unchanged UPSERT, extracts changed UPSERT, and emits DELETE tombstone in one delta batch', async () => {
    const calls: string[] = [];
    const provider = providerWithCalls(calls, (sourceRef, sourceRevision) => ({
      provider: 'treesitter-chunker-8095',
      status: 'PROVEN',
      diagnostics: [],
      evidence: evidence(sourceRef, sourceRevision, 'changed'),
    }));

    const receipt = await runGraphifyStructuralBatchV1({
      workspaceRevision: 'workspace-r2',
      producerRevision: 'test-batch-v1',
      inputs: [
        {
          schema: 'atlas.graphify-structural-delta-input.v1',
          action: 'UPSERT',
          sourceRef: 'src/unchanged.ts',
          sourceRevision: 'same-r1',
          previousSourceRevision: 'same-r1',
          language: 'typescript',
          source: 'export const unchanged = true;',
        },
        {
          schema: 'atlas.graphify-structural-delta-input.v1',
          action: 'UPSERT',
          sourceRef: 'src/changed.ts',
          sourceRevision: 'changed-r2',
          previousSourceRevision: 'changed-r1',
          language: 'typescript',
          source: 'export const changed = 2;',
        },
        {
          schema: 'atlas.graphify-structural-delta-input.v1',
          action: 'DELETE',
          sourceRef: 'src/deleted.ts',
          sourceRevision: 'delete-observation-r3',
          previousSourceRevision: 'deleted-r2',
          identity: {
            canonicalId: 'canonical:deleted',
            packetKey: 'packet:deleted',
            treeNodeId: 'tree:deleted',
            symbolVersionId: 'symbol:deleted',
          },
        },
      ],
    }, new GraphifyStructuralMaterializer(provider));

    expect(receipt.files.map((file) => file.status)).toEqual(['SKIPPED_UNCHANGED', 'PROVEN', 'TOMBSTONED']);
    expect(receipt.incrementalDeltaPass).toBe(true);
    expect(receipt.skippedUnchangedFiles).toBe(1);
    expect(receipt.processedFiles).toBe(1);
    expect(receipt.tombstoneCount).toBe(1);
    expect(receipt.tombstones[0]).toMatchObject({
      sourceRef: 'src/deleted.ts',
      parserInvoked: false,
      canonicalPersistence: 'NOT_ATTEMPTED',
      lifecycleAuthority: 'DOWNSTREAM_CANONICAL_OWNER_REQUIRED',
      packetKey: 'packet:deleted',
    });
    expect(calls).toEqual(['src/changed.ts']);
  });

  it('rejects normalized duplicate source refs before any parser work begins', async () => {
    const calls: string[] = [];
    const provider = providerWithCalls(calls, (sourceRef, sourceRevision) => ({
      provider: 'treesitter-chunker-8095',
      status: 'PROVEN',
      diagnostics: [],
      evidence: evidence(sourceRef, sourceRevision, 'a'),
    }));

    await expect(runGraphifyStructuralBatchV1({
      workspaceRevision: 'workspace-r3',
      producerRevision: 'test-batch-v1',
      inputs: [
        { schema: 'atlas.graphify-structural-delta-input.v1', action: 'UPSERT', sourceRef: 'src/a.ts', sourceRevision: 'a-r1', language: 'typescript', source: 'export const a = 1;' },
        { schema: 'atlas.graphify-structural-delta-input.v1', action: 'UPSERT', sourceRef: './src/a.ts', sourceRevision: 'a-r2', language: 'typescript', source: 'export const a = 2;' },
      ],
    }, new GraphifyStructuralMaterializer(provider))).rejects.toThrow('GRAPHIFY_STRUCTURAL_DUPLICATE_SOURCE_REF:src/a.ts');

    expect(calls).toEqual([]);
  });
});
