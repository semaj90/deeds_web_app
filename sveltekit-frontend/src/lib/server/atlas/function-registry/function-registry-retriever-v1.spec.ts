import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildFunctionRegistrySnapshotV1 } from './function-registry-snapshot-v1.js';
import { qualifyFunctionRegistryEvidenceV1 } from './function-registry-v1.js';
import {
  createQualifiedFunctionRegistryRetrieverV1,
  createFunctionRegistryRetrieverV1,
  functionRegistrySnapshotToLaneCandidatesV1,
} from './function-registry-retriever-v1.js';
import type { FunctionSnapshotLoaderV1 } from './function-registry-snapshot-loader-v1.js';

const workspaceRevision = 'workspace-r1';
const sourceRevision = 'source-r1';
const sourceBytes = Buffer.from('export function findPacket(query: string) { return query; }', 'utf8');
const expectedSourceContentHash = createHash('sha256').update(sourceBytes).digest('hex');

function makeSnapshot() {
  const qualified = qualifyFunctionRegistryEvidenceV1({
    owner: {
      stableSymbolId: 'stable:findPacket',
      symbolVersionId: 'version:findPacket:r1',
      packetKey: 'packet:findPacket',
      treeNodeId: 'tree:findPacket',
      sourceRef: 'src/find-packet.ts',
      sourceRevision,
      workspaceRevision,
      qualifiedName: 'findPacket',
      byteStart: 0,
      byteEnd: sourceBytes.byteLength,
      signatureNormalized: '(query:string)',
      producerRevision: 'symbols-producer-r1',
    },
    ast: {
      sourceRef: 'src/find-packet.ts',
      sourceRevision,
      workspaceRevision,
      qualifiedName: 'findPacket',
      language: 'typescript',
      nodeType: 'function_declaration',
      astPath: 'program/function_declaration',
      startByte: 0,
      endByte: sourceBytes.byteLength,
      signature: 'findPacket(query: string)',
      declarationText: sourceBytes.toString('utf8'),
      parserRevision: 'tree-sitter-ts-r1',
    },
    sourceBytes,
    expectedSourceContentHash,
  });
  if (qualified.status !== 'QUALIFIED_ADVISORY') throw new Error('fixture qualification failed');
  return buildFunctionRegistrySnapshotV1({
    schema: 'atlas.function-registry-snapshot.v1',
    workspaceRevision,
    symbolRegistryRevision: 'symbol-registry-r1',
    parserRevision: 'tree-sitter-ts-r1',
    graphRevision: null,
    toolRegistryRevision: null,
    entries: [qualified.entry],
    relationships: [],
    capabilities: [],
    representations: [],
    status: 'ADVISORY_ONLY',
    canonicalAuthority: false,
    writesAllowed: false,
  });
}

describe('function registry retrieval adapter v1', () => {
  it('maps qualified snapshot rows to the existing AST lane with version identity', () => {
    const candidates = functionRegistrySnapshotToLaneCandidatesV1({
      snapshot: makeSnapshot(),
      expectedWorkspaceRevision: workspaceRevision,
      query: 'findPacket query',
      limit: 5,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      packetKey: 'packet:findPacket',
      symbolVersionId: 'version:findPacket:r1',
      sourceRef: 'src/find-packet.ts',
      sourceRevision,
      workspaceRevision,
      rank: 1,
      lane: 'ast',
      metadata: {
        canonical_function_id: 'stable:findPacket',
        tree_node_id: 'tree:findPacket',
        admission: 'ADVISORY_ONLY',
        canonical_authority: false,
      },
    });
  });

  it('fails closed on workspace mismatch and snapshot checksum tampering', () => {
    const snapshot = makeSnapshot();
    expect(functionRegistrySnapshotToLaneCandidatesV1({
      snapshot,
      expectedWorkspaceRevision: 'workspace-stale',
      query: 'findPacket',
      limit: 5,
    })).toEqual([]);

    expect(functionRegistrySnapshotToLaneCandidatesV1({
      snapshot: { ...snapshot, workspaceRevision: 'workspace-tampered' },
      expectedWorkspaceRevision: workspaceRevision,
      query: 'findPacket',
      limit: 5,
    })).toEqual([]);
  });

  it('uses an injected loader and the existing ast lane contract', async () => {
    const retriever = createFunctionRegistryRetrieverV1({
      loadSnapshot: async () => makeSnapshot(),
      expectedWorkspaceRevision: workspaceRevision,
    });

    await expect(retriever.retrieve({ query: 'findPacket', limit: 2 })).resolves.toMatchObject([
      { symbolVersionId: 'version:findPacket:r1', lane: 'ast', rank: 1 },
    ]);
  });

  it('treats discovery as hints, qualifies unique versions, and returns only the existing ast lane', async () => {
    const loadQualified = vi.fn(async (request: { expectedSourceRevision: string }) => request.expectedSourceRevision === sourceRevision
      ? { status: 'QUALIFIED' as const, snapshot: makeSnapshot(), receipt: {} as never }
      : { status: 'REJECTED' as const, reason: 'REVISION_MISMATCH' as const, receipt: {} as never });
    const loader = { loadQualified } as unknown as FunctionSnapshotLoaderV1;
    const retriever = createQualifiedFunctionRegistryRetrieverV1({
      discoverCandidates: async () => [
        { symbolVersionId: 'version:findPacket:r1', sourceRevision },
        { symbolVersionId: 'version:findPacket:r1', sourceRevision },
        { symbolVersionId: 'version:findPacket:stale', sourceRevision: 'source-stale' },
      ],
      loader,
      expectedWorkspaceRevision: workspaceRevision,
      maxCandidates: 8,
    });

    const candidates = await retriever.retrieve({ query: 'findPacket', limit: 5, workspaceRevision });
    expect(loadQualified).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      packetKey: 'packet:findPacket',
      symbolVersionId: 'version:findPacket:r1',
      lane: 'ast',
      rank: 1,
    });
    await expect(retriever.retrieve({ query: 'findPacket', limit: 5 })).resolves.toEqual([]);
    await expect(retriever.retrieve({ query: 'findPacket', limit: 5, workspaceRevision: 'stale-workspace' }))
      .resolves.toEqual([]);
    expect(loadQualified).toHaveBeenCalledTimes(2);
  });
});
