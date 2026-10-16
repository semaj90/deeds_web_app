import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildFunctionRegistrySnapshotV1 } from './function-registry-snapshot-v1.js';
import { qualifyFunctionRegistryEvidenceV1 } from './function-registry-v1.js';
import {
  createQualifiedFunctionRegistryRetrieverV1,
  createFunctionRegistryRetrieverV1,
  functionRegistrySnapshotToLaneCandidatesV1,
  resolveFunctionRegistryChunkRowV1,
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
  it('resolves a unique proven chunk containing the exact source-qualified function span', () => {
    const bytes = Buffer.from('header\nfunction run() {}\nfooter\n', 'utf8');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const startByte = bytes.indexOf(Buffer.from('function run() {}'));
    const result = resolveFunctionRegistryChunkRowV1({
      sourceBytes: bytes,
      sourceRevision: `sha256:${digest}`,
      sourceContentHash: digest,
      startByte,
      endByte: startByte + Buffer.byteLength('function run() {}'),
      rows: [{ chunkRowId: 'chunk-row-1', canonicalChunkId: 'canonical-chunk-1', content: 'function run() {}', lineStart: 2, lineEnd: 2 }],
    });
    expect(result).toEqual({ chunkRowId: 'chunk-row-1', canonicalChunkId: 'canonical-chunk-1' });
  });

  it('rejects repeated, ambiguous, stale, or non-containing chunk evidence', () => {
    const bytes = Buffer.from('function run() {}\nfunction run() {}\n', 'utf8');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const startByte = bytes.indexOf(Buffer.from('function run() {}'));
    const base = {
      sourceBytes: bytes,
      sourceRevision: `sha256:${digest}`,
      sourceContentHash: digest,
      startByte,
      endByte: startByte + Buffer.byteLength('function run() {}'),
    };
    const row = { chunkRowId: 'chunk-row-1', canonicalChunkId: 'canonical-chunk-1', content: 'function run() {}', lineStart: 1, lineEnd: 1 };
    expect(resolveFunctionRegistryChunkRowV1({ ...base, rows: [row] })).toBeNull();
    expect(resolveFunctionRegistryChunkRowV1({ ...base, rows: [
      { ...row, content: 'function run() {}\nfunction run() {}\n', lineEnd: 2 },
    ] })).toBeNull();
    expect(resolveFunctionRegistryChunkRowV1({ ...base, sourceRevision: `sha256:${'0'.repeat(64)}`, rows: [row] })).toBeNull();
    expect(resolveFunctionRegistryChunkRowV1({ ...base, rows: [row, { ...row, chunkRowId: 'chunk-row-2', canonicalChunkId: 'canonical-chunk-2' }] })).toBeNull();
  });

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
      resolveChunkRow: async () => ({ chunkRowId: 'chunk-row-1', canonicalChunkId: 'canonical-chunk-1' }),
      expectedWorkspaceRevision: workspaceRevision,
      maxCandidates: 8,
    });

    const candidates = await retriever.retrieve({ query: 'findPacket', limit: 5, workspaceRevision });
    expect(loadQualified).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      packetKey: 'packet:findPacket',
      packetId: 'chunk-row-1',
      symbolVersionId: 'version:findPacket:r1',
      metadata: { canonical_chunk_row_id: 'chunk-row-1', canonical_chunk_id: 'canonical-chunk-1' },
      lane: 'ast',
      rank: 1,
    });
    await expect(retriever.retrieve({ query: 'findPacket', limit: 5 })).resolves.toEqual([]);
    await expect(retriever.retrieve({ query: 'findPacket', limit: 5, workspaceRevision: 'stale-workspace' }))
      .resolves.toEqual([]);
    expect(loadQualified).toHaveBeenCalledTimes(2);
  });
});
